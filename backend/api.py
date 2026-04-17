import os
import sys
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Load environment variables (.env in project root)
PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# Add agent module to path
sys.path.insert(0, str(PROJECT_ROOT / "agent"))

from anthropic import AsyncAnthropic  # noqa: E402
from loop import Agent  # noqa: E402
from mcp_client import MCPClient  # noqa: E402
from prompts import SYSTEM_PROMPT  # noqa: E402

# Paths
PAPER_PARSER_SERVER = str(PROJECT_ROOT / "mcp_servers" / "paper_parser" / "server.py")
KNOWLEDGE_GRAPH_SERVER = str(PROJECT_ROOT / "mcp_servers" / "knowledge_graph" / "server.py")
PAPERS_DIR = PROJECT_ROOT / "data" / "papers"
KG_DIR = PROJECT_ROOT / "data" / "knowledge_graphs"
POSITIONS_DIR = PROJECT_ROOT / "data" / "reading_positions"

# Shared state — initialized in lifespan
mcp: MCPClient | None = None
anthropic_client: AsyncAnthropic | None = None
sessions: dict[str, Agent] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start MCP servers on boot, clean up on shutdown."""
    global mcp, anthropic_client

    PAPERS_DIR.mkdir(parents=True, exist_ok=True)
    KG_DIR.mkdir(parents=True, exist_ok=True)
    POSITIONS_DIR.mkdir(parents=True, exist_ok=True)

    anthropic_client = AsyncAnthropic()
    mcp = MCPClient()

    print("Starting MCP servers...")
    paper_tools = await mcp.connect_to_server(PAPER_PARSER_SERVER)
    print(f"  Paper Parser: {paper_tools}")
    kg_tools = await mcp.connect_to_server(KNOWLEDGE_GRAPH_SERVER)
    print(f"  Knowledge Graph: {kg_tools}")
    print(f"  Total tools: {len(paper_tools) + len(kg_tools)}")
    print("API ready.\n")

    yield

    await mcp.cleanup()
    print("MCP servers shut down.")


app = FastAPI(title="Research Mind API", lifespan=lifespan)

# CORS for Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Helpers ----

def get_or_create_session(session_id: str | None) -> tuple[str, Agent]:
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]

    sid = session_id or str(uuid.uuid4())
    agent = Agent(anthropic_client, SYSTEM_PROMPT, mcp_client=mcp)
    sessions[sid] = agent
    return sid, agent


def _positions_path(user_id: str) -> Path:
    return POSITIONS_DIR / f"{user_id}.json"


def load_positions(user_id: str = "default") -> dict:
    p = _positions_path(user_id)
    if not p.exists():
        return {"papers": {}}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {"papers": {}}


def save_positions(data: dict, user_id: str = "default") -> None:
    _positions_path(user_id).write_text(json.dumps(data, indent=2))


def build_reading_context(
    current_paper_id: str | None,
    current_page: int,
    current_line: str = "",
    user_id: str = "default",
) -> str:
    """Build a reading-context block to prepend to the user's chat message.

    Tells the agent which paper is currently open, exactly which line the
    user is looking at, how far they've read overall, and what other papers
    they've engaged with — so the agent knows what it can reference freely
    vs. what would be a spoiler.
    """
    data = load_positions(user_id)
    papers = data.get("papers", {})

    current_info = papers.get(current_paper_id or "", {}) if current_paper_id else {}
    max_read = max(current_info.get("max_page_read", 0), current_page)

    lines = ["[Reading Context]"]

    if current_paper_id and current_info:
        title = current_info.get("title", "Unknown")
        total = current_info.get("total_pages", 0)
        lines.append(
            f'Currently reading: "{title}" (paper_id: {current_paper_id}) — '
            f"on page {current_page} of {total}, max page read: {max_read}."
        )
    elif current_paper_id:
        lines.append(
            f"Currently reading: paper_id {current_paper_id} — on page {current_page}."
        )
    else:
        lines.append("No paper is currently open.")

    if current_line:
        # Clamp the snippet — it comes from the PDF text layer and can be long
        snippet = current_line if len(current_line) <= 300 else current_line[:300] + "…"
        lines.append(f'User is currently looking at this line: "{snippet}"')

    # Other papers the user has touched
    others = []
    for pid, info in papers.items():
        if pid == current_paper_id:
            continue
        title = info.get("title", "Unknown")
        max_r = info.get("max_page_read", 0)
        total = info.get("total_pages", 0)
        status = (
            "fully read"
            if max_r >= total and total > 0
            else f"read through page {max_r} of {total}"
        )
        others.append(f'  - "{title}" (paper_id: {pid}) — {status}')
    if others:
        lines.append("Other papers in the user's library:")
        lines.extend(others)

    lines.append("")
    lines.append(
        "Spoiler rules: For the currently-open paper, do NOT reveal or reference "
        f"content past page {max_read}. The 'current line' above tells you "
        "exactly where the user is within that page — use it to ground your "
        "answer in what they're looking at right now. For other papers in the "
        "library that the user has already read, you may reference their concepts "
        "freely — but never use them to spoil later parts of the current paper. "
        "When calling add_concept, include the paper title and current page in "
        "the source field."
    )
    lines.append("[/Reading Context]")
    return "\n".join(lines)


# ---- Request models ----

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    paper_id: str | None = None
    current_paper_id: str | None = None
    current_page: int = 0
    current_line: str = ""


class ReadingPositionRequest(BaseModel):
    paper_id: str
    title: str
    current_page: int
    total_pages: int
    user_id: str = "default"


# ---- Endpoints ----

@app.post("/api/upload")
async def upload_paper(file: UploadFile):
    """Upload a PDF and parse it via the Paper Parser MCP server."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    paper_id = str(uuid.uuid4())[:8]
    ext = Path(file.filename).suffix
    save_path = PAPERS_DIR / f"{paper_id}{ext}"

    content = await file.read()
    save_path.write_bytes(content)

    # Parse via MCP
    try:
        result_str = await mcp.call_tool("parse_paper", {
            "pdf_path": str(save_path),
            "paper_id": paper_id,
        })
        result = json.loads(result_str)
    except Exception as e:
        return {
            "paper_id": paper_id,
            "title": file.filename,
            "authors": "",
            "num_sections": 0,
            "section_names": [],
            "error": str(e),
        }

    return {
        "paper_id": paper_id,
        "title": result.get("title", file.filename),
        "authors": result.get("authors", ""),
        "num_sections": result.get("num_sections", 0),
        "section_names": result.get("section_names", []),
    }


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Send a message to the agent and stream back the response via SSE.

    Prepends a reading-context block so the agent knows which paper is open,
    how far the user has read, and which other papers they've seen.
    """
    session_id, agent = get_or_create_session(request.session_id)

    reading_ctx = build_reading_context(
        current_paper_id=request.current_paper_id,
        current_page=request.current_page,
        current_line=request.current_line,
    )
    enriched_message = f"{reading_ctx}\n\n{request.message}"

    async def event_stream():
        try:
            async for event in agent.chat_stream(enriched_message):
                event_type = event["type"]
                if event_type == "done":
                    yield f"event: done\ndata: {json.dumps({'session_id': session_id})}\n\n"
                else:
                    yield f"event: {event_type}\ndata: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/reading-position")
async def update_reading_position(req: ReadingPositionRequest):
    """Persist the user's live reading position for a paper.

    max_page_read is monotonic: it only ever increases. current_page is the
    live position (can go up or down as the user scrolls around).
    """
    data = load_positions(req.user_id)
    papers = data.setdefault("papers", {})

    existing = papers.get(req.paper_id, {})
    prev_max = existing.get("max_page_read", 0)

    papers[req.paper_id] = {
        "title": req.title,
        "total_pages": req.total_pages,
        "current_page": req.current_page,
        "max_page_read": max(prev_max, req.current_page),
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }

    save_positions(data, req.user_id)
    return {"ok": True, "max_page_read": papers[req.paper_id]["max_page_read"]}


@app.get("/api/reading-position")
async def get_reading_positions(user_id: str = "default"):
    """Return all stored reading positions for a user."""
    return load_positions(user_id)


@app.get("/api/knowledge-graph")
async def get_knowledge_graph(user_id: str = "default"):
    """Return the knowledge graph in {nodes, links} format for visualization."""
    kg_path = KG_DIR / f"{user_id}.json"

    if not kg_path.exists():
        return {"nodes": [], "links": []}

    data = json.loads(kg_path.read_text())
    concepts = data.get("concepts", {})

    nodes = []
    links = []
    seen = set()

    for name, info in concepts.items():
        seen.add(name)
        nodes.append({
            "id": name,
            "confidence": info["confidence"],
            "source": info.get("source", ""),
        })
        for prereq in info.get("prerequisites", []):
            links.append({"source": name, "target": prereq})
            # Add unknown prerequisites as gap nodes
            if prereq not in seen and prereq not in concepts:
                seen.add(prereq)
                nodes.append({"id": prereq, "confidence": 0.0, "source": ""})

    return {"nodes": nodes, "links": links}


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Return conversation history for a session."""
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    agent = sessions[session_id]
    messages = []
    for msg in agent.conversation_history:
        if msg["role"] == "user" and isinstance(msg["content"], str):
            messages.append({"role": "user", "content": msg["content"]})
        elif msg["role"] == "assistant":
            text_parts = []
            for block in msg["content"]:
                if hasattr(block, "text"):
                    text_parts.append(block.text)
            if text_parts:
                messages.append({"role": "assistant", "content": "".join(text_parts)})

    return {"session_id": session_id, "messages": messages}

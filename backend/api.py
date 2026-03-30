import os
import sys
import json
import uuid
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


# ---- Request models ----

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    paper_id: str | None = None


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
    """Send a message to the agent and stream back the response via SSE."""
    session_id, agent = get_or_create_session(request.session_id)

    async def event_stream():
        try:
            async for event in agent.chat_stream(request.message):
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

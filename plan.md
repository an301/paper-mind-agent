# Paper Mind Agent — Full Implementation Plan

## Context

The project is at **Phase 2 of 7** (original spec). The ReAct agent loop and Paper Parser MCP server are working end-to-end via CLI. The user wants to:
1. Add a **web frontend** with PDF upload + chatbot interface
2. Add a **knowledge graph visualization** page (interactive force-directed graph)
3. Complete all remaining backend phases (Knowledge Graph MCP, Academic Search MCP, Embeddings, Fine-tuning, Evaluation)

This plan inserts the frontend after Phase 3 (Knowledge Graph MCP) — the earliest point where there's something visually interesting to show in the graph.

---

## Technology Choices

| Component | Choice | Why |
|-----------|--------|-----|
| Frontend framework | **React + Vite** (TypeScript) | Simple setup, huge ecosystem, good for learning. Next.js overkill (no SSR needed). Plain HTML gets painful with reactive state. |
| Graph visualization | **react-force-graph-2d** | Wraps D3's force simulation in a React component. Pass `{ nodes, links }`, get an interactive graph. Lowest friction path. |
| Chat UI | **Custom component** | A chat interface is ~80 lines of React + 60 lines of CSS. Libraries add opinions that are hard to override. |
| Agent communication | **SSE (Server-Sent Events)** | Unidirectional streaming (user POST, server streams back). FastAPI has native support via `StreamingResponse`. Simpler than WebSockets. |
| Backend API | **FastAPI** | Already installed. Native async (matches existing agent code). Built-in file upload, Swagger docs, Pydantic models. |
| Embeddings | **sentence-transformers** (`all-MiniLM-L6-v2`) | Runs on CPU, no API key, 80MB model. Higher learning value than OpenAI API. |

---

## Revised Phase Plan

### Phase 3: Knowledge Graph MCP Server
**New concept:** Graph data structures, BFS, persistent JSON storage

**Build:**
- `mcp_servers/knowledge_graph/graph.py` — `KnowledgeGraph` class: load/save JSON, add_concept, update_confidence, find_prerequisite_gaps (BFS), get_learning_path
- `mcp_servers/knowledge_graph/server.py` — FastMCP server with 5 tools: `get_user_knowledge`, `find_prerequisite_gaps`, `add_concept`, `update_confidence`, `get_learning_path`
- `mcp_servers/knowledge_graph/test_knowledge_graph.py` — Smoke test

**Modify:**
- `agent/main.py` — Add second `mcp.connect_to_server()` for knowledge graph
- `agent/prompts.py` — Instruct agent to check user knowledge before answering, update confidence after explaining

**Data model** (`data/knowledge_graphs/default.json`):
```json
{
  "user_id": "default",
  "concepts": {
    "softmax": {
      "confidence": 0.6,
      "prerequisites": ["exponential_function", "normalization"],
      "source": "Attention Is All You Need, Section 3.2",
      "last_updated": "2026-03-28T10:00:00"
    }
  }
}
```

**Done when:** Agent calls `find_prerequisite_gaps` before explaining complex concepts, calls `add_concept` after explaining. Knowledge persists across restarts (JSON file on disk).

---

### Phase 4A: FastAPI Backend
**New concept:** REST APIs, async streaming, SSE

**Create:**
- `backend/api.py` — FastAPI app with lifespan manager for MCP servers
- `backend/sessions.py` — In-memory session store `{ session_id: { conversation_history, paper_id } }`
- `backend/models.py` — Pydantic request/response schemas

**Endpoints:**
1. `POST /api/upload` — Accept PDF (`UploadFile`), save to `data/papers/`, call `parse_paper`, return `{ paper_id, sections }`
2. `POST /api/chat` — Accept `{ session_id?, message }`, stream response as SSE events:
   - `event: token` — individual tokens
   - `event: tool_call` — tool call notifications (UI shows "Agent is searching...")
   - `event: done` — stream complete with session_id
3. `GET /api/knowledge-graph` — Return graph as `{ nodes: [...], links: [...] }` for visualization
4. `GET /api/sessions/{session_id}` — Return conversation history

**Modify:**
- `agent/loop.py` — Add `chat_stream()` async generator method using `client.messages.stream()` instead of `client.messages.create()`. Yields token/tool_call/tool_result events. Existing `chat()`/`chat_async()` methods stay unchanged.

**Done when:** Can use curl or Swagger UI (`/docs`) to upload a PDF, send chat messages with streaming tokens, and fetch knowledge graph JSON.

---

### Phase 4B: React Frontend (Chat + Upload)
**New concept:** React, Vite, components, state management

**Create `frontend/` with:**
- `src/App.tsx` — Layout: sidebar (upload) + main area (chat) + tab for graph
- `src/components/ChatPanel.tsx` — Message list + input. Read SSE stream, append tokens to latest assistant message.
- `src/components/UploadPanel.tsx` — File input, POST as `multipart/form-data`, show upload status
- `src/components/ToolCallIndicator.tsx` — Shows "Agent is calling search_paper..."
- `src/api.ts` — Fetch wrappers for all endpoints, SSE reading logic
- `src/hooks/useChat.ts` — Chat state + streaming logic
- `vite.config.ts` — Proxy `/api` to FastAPI at port 8000

**Done when:** Open browser, upload a PDF, chat with the agent, see streaming responses. Functional, not pretty — styling is iterative.

---

### Phase 5: Knowledge Graph Visualization
**New concept:** Data visualization, force-directed graphs

**Create:**
- `src/components/KnowledgeGraphPanel.tsx` — Uses `react-force-graph-2d`
- `src/hooks/useKnowledgeGraph.ts` — Fetch graph data, refresh after each chat exchange

**Graph rendering:**
- **Node size** = `3 + confidence * 15` (bigger = more confident)
- **Node color** = confidence band: red (<0.3), orange (0.3-0.5), yellow (0.5-0.7), green (>0.7)
- **Edges** = directed arrows from concept to prerequisites
- **Click** = tooltip with confidence, source, prerequisites
- **Refresh** = re-fetch graph when SSE stream ends (`done` event)

**API transform** — Convert flat JSON to `{ nodes, links }` format. Prerequisites not yet in the graph appear as nodes with confidence 0.0 (small red dots = knowledge gaps).

**Done when:** Chat about a paper, switch to Knowledge Graph tab, see concepts as interactive force-directed graph. Graph grows as you learn. Colors/sizes reflect understanding.

---

### Phase 6: Academic Search MCP Server
**New concept:** External REST API integration, rate limiting, caching

**Create:**
- `mcp_servers/academic_search/server.py` — FastMCP server: `search_papers`, `get_paper_details`, `find_explanations`, `get_citation_context`
- `mcp_servers/academic_search/client.py` — Semantic Scholar API client with rate limiting (1 req/sec) + response caching

**Wire:** Third `mcp.connect_to_server()` in API startup. Update system prompt.

**Done when:** Ask "I don't understand attention, can you find a simpler explanation?" — agent searches Semantic Scholar, finds a survey, incorporates it.

---

### Phase 7: Embeddings + Semantic Search (RAG)
**New concept:** Text embeddings, vector similarity, FAISS

**Create:**
- `mcp_servers/paper_parser/embeddings.py` — `embed_texts()` using `sentence-transformers` (`all-MiniLM-L6-v2`, runs on CPU)

**Modify:**
- `mcp_servers/paper_parser/parser.py` — In `add_paper()`, chunk sections into ~200-word paragraphs, embed them, store in FAISS index
- `mcp_servers/paper_parser/server.py` — `search_paper` uses FAISS similarity search instead of keyword matching

**Done when:** Ask a conceptual question, agent retrieves semantically relevant passages (not just keyword matches) across sections.

---

### Phase 8: Fine-Tuning
**New concept:** LoRA, dataset curation, HuggingFace PEFT

**Create:**
- `fine_tuning/data/generate_dataset.py` — Generate 1-2K training examples using Claude
- `fine_tuning/data/training_data.jsonl` — Curated dataset
- `fine_tuning/train.py` — LoRA fine-tuning script (Llama 3 8B or Mistral 7B)
- `fine_tuning/evaluate.py` — Compare fine-tuned vs base model

**Modify:** `POST /api/chat` accepts optional `model` parameter (`"claude"` or `"finetuned"`)

**Done when:** Toggle between Claude and fine-tuned model in chat UI. Fine-tuned model produces more calibrated explanations.

**Requires:** GPU access (Colab Pro or local 16GB+ VRAM)

---

### Phase 9: Evaluation + Benchmarking
**New concept:** Systematic evaluation, metrics

**Create:**
- `evaluation/benchmark.py` — Run test questions through all backends
- `evaluation/test_questions.json` — 20-30 questions across 5 papers at 3 difficulty levels
- `evaluation/results/` — Output data and charts

**Done when:** README has benchmark table: base model vs fine-tuned vs Claude with specific numbers.

---

### Phase 10: Polish + Documentation

- `requirements.txt` with pinned dependencies
- Comprehensive `README.md` with architecture diagram, setup instructions, screenshots, benchmark results
- Frontend error handling, loading states, responsive design
- `.github/workflows/ci.yml` for linting/type checking
- Code cleanup

---

## Project File Structure (Complete)

```
paper-mind-agent/
├── agent/
│   ├── loop.py              # ReAct loop (modify: add chat_stream)
│   ├── main.py              # CLI entry point (keep for debugging)
│   ├── mcp_client.py        # MCP connection manager (unchanged)
│   ├── prompts.py           # System prompts (evolves each phase)
│   └── tools.py             # Phase 1 dummy tools (keep for reference)
├── backend/                  # NEW — Phase 4A
│   ├── api.py               # FastAPI app, endpoints, lifespan
│   ├── sessions.py          # In-memory session management
│   └── models.py            # Pydantic schemas
├── frontend/                 # NEW — Phase 4B
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── UploadPanel.tsx
│   │   │   ├── KnowledgeGraphPanel.tsx  # Phase 5
│   │   │   └── ToolCallIndicator.tsx
│   │   └── hooks/
│   │       ├── useChat.ts
│   │       └── useKnowledgeGraph.ts     # Phase 5
│   ├── vite.config.ts
│   └── package.json
├── mcp_servers/
│   ├── paper_parser/         # Existing
│   │   ├── server.py
│   │   ├── parser.py         # Modify in Phase 7 (chunking + FAISS)
│   │   ├── embeddings.py     # NEW — Phase 7
│   │   └── test_parser.py
│   ├── knowledge_graph/      # NEW — Phase 3
│   │   ├── server.py
│   │   ├── graph.py
│   │   └── test_knowledge_graph.py
│   └── academic_search/      # NEW — Phase 6
│       ├── server.py
│       ├── client.py
│       └── test_academic_search.py
├── fine_tuning/              # Phase 8
│   ├── data/
│   │   ├── generate_dataset.py
│   │   └── training_data.jsonl
│   ├── train.py
│   └── evaluate.py
├── evaluation/               # Phase 9
│   ├── benchmark.py
│   ├── test_questions.json
│   └── results/
├── data/
│   ├── papers/               # Uploaded PDFs
│   └── knowledge_graphs/     # User knowledge JSON files
├── requirements.txt
├── CLAUDE.md
├── spec.md
└── README.md
```

---

## Phase Summary

| Phase | Name | Key Deliverable | Est. Hours |
|-------|------|-----------------|------------|
| 3 | Knowledge Graph MCP | Agent tracks knowledge, finds prerequisite gaps | ~10 |
| 4A | FastAPI Backend | API wrapping agent, streaming chat, file upload | ~8 |
| 4B | React Frontend (Chat) | Browser-based chat with PDF upload | ~10 |
| 5 | Knowledge Graph Viz | Interactive force-directed graph of learned concepts | ~8 |
| 6 | Academic Search MCP | Agent searches Semantic Scholar autonomously | ~6 |
| 7 | Embeddings + RAG | Semantic search within papers via FAISS | ~10 |
| 8 | Fine-Tuning | LoRA fine-tuned model for calibrated explanations | ~15 |
| 9 | Evaluation | Benchmark results comparing all backends | ~12 |
| 10 | Polish | README, requirements, CI, error handling | ~6 |

**Total remaining: ~85 hours**

---

## Verification Plan

After each phase, verify:
- **Phase 3:** Chat via CLI, observe agent calling KG tools, inspect JSON file growing
- **Phase 4A:** `curl` / Swagger UI to upload PDF, send chat, see streaming tokens
- **Phase 4B:** Open browser → upload PDF → chat → see streaming responses
- **Phase 5:** Chat, switch to graph tab, see concepts appear as interactive nodes
- **Phase 6:** Ask agent to find external explanations, see Semantic Scholar results
- **Phase 7:** Ask conceptual question, verify semantically relevant passages returned
- **Phase 8:** Toggle models in UI, compare explanation quality
- **Phase 9:** Run `evaluation/benchmark.py`, check results table
- **Phase 10:** Fresh clone → follow README → everything works

---

## Immediate Next Step

**Phase 3: Knowledge Graph MCP Server.** Start with `mcp_servers/knowledge_graph/graph.py` — get the data model right, BFS working, JSON persistence working. Then wrap in FastMCP. Then wire to agent. Then test the full loop.

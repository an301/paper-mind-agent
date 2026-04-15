# CLAUDE.md — paper-mind-agent

## Project Overview

Adaptive AI Paper Reading Agent. A multi-agent system that helps users read and understand ML/AI research papers by tracking their knowledge state, identifying prerequisite gaps, and calibrating explanations to their level. Uses LangGraph for multi-agent orchestration, RAG with FAISS for semantic retrieval, and an interactive knowledge graph visualization.

## Architecture

### Multi-Agent System (LangGraph)

The system uses LangGraph to orchestrate multiple specialized agents that communicate through a shared state graph:

- **Orchestrator Agent** — Routes user queries to the appropriate specialist agents, manages conversation flow, and synthesizes final responses. Decides whether a question needs paper retrieval, knowledge checking, external search, or a combination.
- **Paper Reader Agent** — Specializes in paper content retrieval and comprehension. Has access to Paper Parser MCP tools. Retrieves relevant sections, respects reading position, and extracts key concepts from passages.
- **Knowledge Tracker Agent** — Manages the user's knowledge state. Has access to Knowledge Graph MCP tools. Checks prerequisites before explanations, updates confidence scores after interactions, and identifies learning gaps.
- **Research Agent** — Handles external paper discovery and cross-paper reasoning. Has access to Academic Search MCP tools. Finds related papers, citation context, and connects concepts across multiple papers.
- **Explainer Agent** — Generates calibrated explanations based on context from the other agents. Can use either Claude or the fine-tuned model as its backend. Adapts explanation depth based on knowledge state from the Knowledge Tracker.

Agent communication flow:
```
User Query → Orchestrator → [Paper Reader, Knowledge Tracker, Research Agent]
                                        ↓ (context gathered)
                                    Explainer Agent
                                        ↓
                                  Final Response → User
```

### MCP Tool Servers

- **Paper Parser MCP** (`mcp_servers/paper_parser/`) — PDF parsing via PyMuPDF, section splitting by headings, semantic search via embeddings + FAISS. Exposes: `parse_paper`, `get_section`, `get_sections_up_to`, `search_paper`, `get_paper_metadata`.
- **Knowledge Graph MCP** (`mcp_servers/knowledge_graph/`) — Persistent JSON-based concept graph with confidence scores (0.0–1.0), prerequisite edges, and source tracking. Exposes: `get_user_knowledge`, `find_prerequisite_gaps`, `add_concept`, `update_confidence`, `get_learning_path`. Gap detection uses BFS on the dependency graph.
- **Academic Search MCP** (`mcp_servers/academic_search/`) — Wrapper around Semantic Scholar's REST API (free, no key needed for basic use). Exposes: `search_papers`, `get_paper_details`, `find_explanations`, `get_citation_context`.

### RAG Pipeline

- Embedding model: `text-embedding-3-small` or sentence-transformers (`all-MiniLM-L6-v2`)
- Vector store: FAISS index per paper, chunks of ~512 tokens with overlap
- Retrieval: Embed user query → cosine similarity search → top-k chunks fed as context to agents

### Fine-Tuned Model

- LoRA fine-tuned Llama 3 8B or Mistral 7B on 1-2K curated (concept, expertise_level, explanation) triplets using HuggingFace PEFT. Toggleable as an alternative backend to Claude for the Explainer Agent.

### Frontend Features

- **Interactive Knowledge Graph Visualization** — D3-force directed graph rendering. Nodes represent concepts sized by confidence score, edges show prerequisite relationships. Nodes glow based on confidence level. Clickable for concept details.
- **Multi-Paper Workspace** — Upload and reason across multiple papers simultaneously. Agent connects concepts across papers and identifies shared/conflicting ideas.
- **Real-time Streaming** — SSE-based token streaming from the multi-agent pipeline through FastAPI to the React frontend.

## Project Structure

```
paper-mind-agent/
├── agent/
│   ├── graph.py             # LangGraph state graph definition
│   ├── orchestrator.py      # Orchestrator agent node
│   ├── paper_reader.py      # Paper Reader agent node
│   ├── knowledge_tracker.py # Knowledge Tracker agent node
│   ├── research_agent.py    # Research/Academic Search agent node
│   ├── explainer.py         # Explainer agent node
│   ├── state.py             # Shared state schema
│   ├── prompts.py           # System prompts per agent
│   ├── loop.py              # Legacy single-agent ReAct loop (kept for reference)
│   └── mcp_client.py        # MCP server connector
├── mcp_servers/
│   ├── paper_parser/        # PDF parsing + embeddings + section extraction
│   ├── knowledge_graph/     # User knowledge tracking + prerequisite gaps
│   └── academic_search/     # Semantic Scholar API wrapper
├── fine_tuning/
│   ├── data/                # Curated training dataset
│   ├── train.py             # LoRA fine-tuning script
│   └── evaluate.py          # Model comparison and metrics
├── evaluation/
│   ├── benchmark.py         # Runs all benchmark tests
│   ├── test_questions.json  # 20-30 test cases across 5 papers
│   └── results/             # Output data and charts
├── backend/
│   └── api.py               # FastAPI backend with SSE streaming
├── frontend/
│   └── src/
│       ├── App.tsx           # Main layout
│       ├── components/
│       │   ├── ChatPanel.tsx
│       │   ├── DocumentViewer.tsx
│       │   ├── UploadZone.tsx
│       │   └── KnowledgeGraphPanel.tsx  # D3-force interactive graph
│       └── api.ts            # Backend API client
├── data/                    # Stored knowledge graphs and parsed papers
├── README.md
├── requirements.txt
└── .github/workflows/       # CI pipeline
```

## Tech Stack

- **LangGraph** — Multi-agent orchestration with state graphs, conditional routing, checkpointing
- **Anthropic SDK** (`anthropic`) — LLM calls and tool use
- **MCP Python SDK** — building tool servers
- **PyMuPDF** (`fitz`) — PDF text extraction
- **FAISS** — vector storage and semantic search
- **sentence-transformers** or **OpenAI embeddings** — `all-MiniLM-L6-v2` or `text-embedding-3-small`
- **HuggingFace transformers + PEFT** — LoRA fine-tuning
- **D3.js** (`d3-force`) — Interactive knowledge graph visualization
- **requests** — HTTP calls to Semantic Scholar API
- **JSON files** — persistent storage (knowledge graph, parsed papers)

## Hard Rules

1. **Frameworks allowed for orchestration.** LangGraph, LangChain, etc. are permitted for multi-agent orchestration and workflow management. Core components (MCP servers, knowledge graph, paper parser) were built from scratch to understand the fundamentals — now frameworks can be layered on top for coordination.
2. **Phase discipline.** The project is built in phases phases. Each phase must work and be tested independently before moving to the next. Do not skip ahead.
3. **Test before integrating.** Each MCP server should be testable in isolation with mock inputs before wiring it to the agent loop.
4. **Clean Git hygiene.** Feature branches for each phase (`phase-1/basic-agent`, `phase-2/paper-parser`, etc.). Clear commit messages. Daily commits when actively working.

## Key Design Decisions

- **Multi-agent over single agent.** Splitting responsibilities lets each agent have a focused system prompt and smaller tool set, improving reliability. The orchestrator handles routing so specialist agents don't get confused by irrelevant tools.
- **LangGraph state graph for coordination.** Agents communicate through a shared state dict, not direct message passing. This makes the flow debuggable and checkpointable.
- **The LLM decides tool calls, not hardcoded logic.** Each agent's system prompt describes its available tools and it picks which to call. Different questions produce different agent activation patterns.
- **Knowledge graph is JSON, not a graph database.** Simplicity wins. The graph is small enough (hundreds to low thousands of nodes) that BFS on an adjacency list in memory is fine.
- **Reading position is enforced server-side.** The Paper Parser only returns sections up to the user's current position. The agent can't accidentally spoil later sections because it literally can't access them.
- **Confidence scores are the agent's judgment, not the user's self-report.** The agent infers understanding from the conversation and updates scores accordingly.
- **Multi-paper reasoning via shared knowledge graph.** Concepts from different papers are stored in the same graph. When a concept appears in multiple papers, the Knowledge Tracker links them, enabling cross-paper reasoning.

## Common Pitfalls to Avoid

- Don't dump entire paper text into the LLM context. Use `get_section` for the specific section and `get_sections_up_to` for summaries of prior sections.
- Don't hardcode prerequisite relationships — let the agent + knowledge graph figure them out dynamically as the user reads more papers.
- Don't over-engineer the knowledge graph. Start with a flat JSON dict of concepts. Add complexity only when you hit a real limitation.
- Don't fine-tune on garbage data. Manually review at least 10% of your training examples. If the generated explanations aren't good, regenerate them with better prompts.
- Rate limit Semantic Scholar API calls — they throttle aggressively. Cache results.

## Build Phases (Reference)

| Phase | Focus                        | Key Deliverable                                                  | Status  |
| ----- | ---------------------------- | ---------------------------------------------------------------- | ------- |
| 1     | Basic API + tool calling     | Working ReAct loop with toy tools                                | Done    |
| 2     | Paper Parser MCP             | Agent can parse and read paper sections                          | Done    |
| 3     | Knowledge Graph MCP          | Agent tracks user knowledge, finds prereq gaps                   | Done    |
| 4     | Academic Search MCP          | Agent searches Semantic Scholar autonomously                     | Pending |
| 5     | Embeddings + RAG             | Semantic search within papers via FAISS                          | Pending |
| 6     | Multi-Agent (LangGraph)      | Orchestrator + specialist agents with state graph                | Pending |
| 7     | Knowledge Graph Visualization| Interactive D3-force graph in frontend                           | Pending |
| 8     | Multi-Paper Reasoning        | Cross-paper concept linking and comparative analysis             | Pending |
| 9     | Fine-tuning                  | LoRA fine-tuned model for calibrated explanations                | Pending |
| 10    | Evaluation                   | Benchmark results comparing base vs fine-tuned vs Claude         | Pending |

## Testing

- Each MCP server should have a `test_*.py` file with basic smoke tests
- Test the agent loop with mock tool responses before connecting real servers
- Benchmark evaluation uses `evaluation/test_questions.json` — 20-30 questions across 5 papers at 3 difficulty levels
- Fine-tuned model evaluation compares against base model and Claude on the same test set

## Environment

- GPU needed for Phase 6 only (fine-tuning). Use Google Colab Pro ($10/mo) or local NVIDIA GPU with 16GB+ VRAM.
- Everything else runs on CPU / laptop.
- API keys needed: Anthropic (for Claude calls), optionally OpenAI (for embeddings if not using open-source).

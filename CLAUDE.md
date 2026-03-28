# CLAUDE.md — paper-mind-agent

## Project Overview

Adaptive AI Paper Reading Agent. An agentic system that helps users read and understand ML/AI research papers by tracking their knowledge state, identifying prerequisite gaps, and calibrating explanations to their level. Built entirely from scratch — no LangChain, no LlamaIndex, no CrewAI.

## Architecture

Five components, each a separate Python module:

- **Agent Loop** (`agent/`) — Hand-written ReAct loop. Sends user query + context to Claude, parses tool calls from response, executes them, feeds results back. Loop continues until the LLM decides it has enough info to answer. ~100-150 lines of core orchestration.
- **Paper Parser MCP Server** (`mcp_servers/paper_parser/`) — PDF parsing via PyMuPDF, section splitting by headings, semantic search via embeddings + FAISS. Exposes: `parse_paper`, `get_section`, `get_sections_up_to`, `search_paper`, `get_paper_metadata`.
- **Knowledge Graph MCP Server** (`mcp_servers/knowledge_graph/`) — Persistent JSON-based concept graph with confidence scores (0.0–1.0), prerequisite edges, and source tracking. Exposes: `get_user_knowledge`, `find_prerequisite_gaps`, `add_concept`, `update_confidence`, `get_learning_path`. Gap detection uses BFS on the dependency graph.
- **Academic Search MCP Server** (`mcp_servers/academic_search/`) — Wrapper around Semantic Scholar's REST API (free, no key needed for basic use). Exposes: `search_papers`, `get_paper_details`, `find_explanations`, `get_citation_context`.
- **Fine-Tuned Model** (`fine_tuning/`) — LoRA fine-tuned Llama 3 8B or Mistral 7B on 1-2K curated (concept, expertise_level, explanation) triplets using HuggingFace PEFT. Toggleable as an alternative backend to Claude for explanation generation.

## Project Structure

```
paper-mind-agent/
├── agent/
│   ├── main.py              # Entry point
│   ├── loop.py              # ReAct loop logic
│   ├── context.py           # Context assembly for prompts
│   └── prompts.py           # System prompts and templates
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
├── data/                    # Stored knowledge graphs and parsed papers
├── README.md
├── requirements.txt
└── .github/workflows/       # CI pipeline
```

## Tech Stack

- **Anthropic SDK** (`anthropic`) — LLM calls and tool use
- **MCP Python SDK** — building tool servers
- **PyMuPDF** (`fitz`) — PDF text extraction
- **FAISS** or **ChromaDB** — vector storage and search
- **OpenAI or open-source embedding model** — `text-embedding-3-small` or sentence-transformers
- **HuggingFace transformers + PEFT** — LoRA fine-tuning
- **requests** — HTTP calls to Semantic Scholar API
- **JSON files** — persistent storage (knowledge graph, parsed papers). SQLite is an acceptable upgrade but not required.

## Hard Rules

1. **No frameworks.** No LangChain, LlamaIndex, CrewAI, or any agent/RAG framework. Every component is built from raw libraries. If you can't explain every line, you shouldn't have written it.
2. **Phase discipline.** The project is built in phases phases. Each phase must work and be tested independently before moving to the next. Do not skip ahead.
3. **Test before integrating.** Each MCP server should be testable in isolation with mock inputs before wiring it to the agent loop.
4. **Clean Git hygiene.** Feature branches for each phase (`phase-1/basic-agent`, `phase-2/paper-parser`, etc.). Clear commit messages. Daily commits when actively working.

## Key Design Decisions

- **ReAct loop is a while loop, not recursion.** Easier to debug, no stack depth issues.
- **The LLM decides tool calls, not hardcoded logic.** The system prompt describes available tools and the agent picks which to call. Different questions produce different tool-call sequences.
- **Knowledge graph is JSON, not a graph database.** Simplicity wins. The graph is small enough (hundreds to low thousands of nodes) that BFS on an adjacency list in memory is fine.
- **Reading position is enforced server-side.** The Paper Parser only returns sections up to the user's current position. The agent can't accidentally spoil later sections because it literally can't access them.
- **Confidence scores are the agent's judgment, not the user's self-report.** The agent infers understanding from the conversation and updates scores accordingly.

## Common Pitfalls to Avoid

- Don't dump entire paper text into the LLM context. Use `get_section` for the specific section and `get_sections_up_to` for summaries of prior sections.
- Don't hardcode prerequisite relationships — let the agent + knowledge graph figure them out dynamically as the user reads more papers.
- Don't over-engineer the knowledge graph. Start with a flat JSON dict of concepts. Add complexity only when you hit a real limitation.
- Don't fine-tune on garbage data. Manually review at least 10% of your training examples. If the generated explanations aren't good, regenerate them with better prompts.
- Rate limit Semantic Scholar API calls — they throttle aggressively. Cache results.

## Build Phases (Reference)

| Phase | Focus                    | Key Deliverable                                          |
| ----- | ------------------------ | -------------------------------------------------------- |
| 1     | Basic API + tool calling | Working ReAct loop with toy tools                        |
| 2     | Paper Parser MCP         | Agent can parse and read paper sections                  |
| 3     | Knowledge Graph MCP      | Agent tracks user knowledge, finds prereq gaps           |
| 4     | Academic Search MCP      | Agent searches Semantic Scholar autonomously             |
| 5     | Embeddings + RAG         | Semantic search within papers via FAISS                  |
| 6     | Fine-tuning              | LoRA fine-tuned model for calibrated explanations        |
| 7     | Evaluation               | Benchmark results comparing base vs fine-tuned vs Claude |

## Testing

- Each MCP server should have a `test_*.py` file with basic smoke tests
- Test the agent loop with mock tool responses before connecting real servers
- Benchmark evaluation uses `evaluation/test_questions.json` — 20-30 questions across 5 papers at 3 difficulty levels
- Fine-tuned model evaluation compares against base model and Claude on the same test set

## Environment

- GPU needed for Phase 6 only (fine-tuning). Use Google Colab Pro ($10/mo) or local NVIDIA GPU with 16GB+ VRAM.
- Everything else runs on CPU / laptop.
- API keys needed: Anthropic (for Claude calls), optionally OpenAI (for embeddings if not using open-source).

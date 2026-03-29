# Adaptive AI Paper Reading Agent

**Full Project Breakdown**

---

## 1. What You're Building

An AI agent that helps you read and understand research papers. It's not a simple "upload PDF, ask questions" chatbot. It's fundamentally different because:

- **It tracks where you are in the paper** and only uses information from sections you've already read (no spoilers for later sections)
- **It maintains a knowledge graph of YOUR understanding** — what concepts you know well, what you're shaky on, and what's completely new. This persists across sessions and across papers.
- **It identifies prerequisite gaps** before answering. If you ask about "variational autoencoders" but don't understand KL divergence, it explains KL divergence first.
- **It calibrates explanations to your level.** A beginner gets analogies and intuition. Someone with more background gets the math.
- **It uses a fine-tuned model** that you train specifically on the task of producing calibrated explanations, outperforming generic models.

---

## 2. Architecture Overview

The system has five major components. Each one is a separate Python module that you build one at a time.

| Component               | What It Is                                                                                                       | What It Teaches You                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Agent Loop**          | Python script with a while loop that calls the LLM, decides what tool to use, executes it, feeds the result back | How agents work, ReAct pattern, tool selection, context assembly, conversation management               |
| **Paper Parser MCP**    | MCP server that takes PDFs and breaks them into structured sections, extracts metadata, tracks reading position  | MCP protocol, PDF parsing, text extraction, document structure, how to build a tool server from scratch |
| **Knowledge Graph MCP** | MCP server that stores what concepts the user understands, finds prerequisite gaps, updates confidence over time | Knowledge representation, graph data structures, persistent state, user modeling, JSON storage          |
| **Academic Search MCP** | MCP server that wraps Semantic Scholar API to search papers, fetch abstracts, find explanations of concepts      | API integration, external data retrieval, search relevance, how to wrap a REST API as MCP tools         |
| **Fine-Tuned Model**    | A LoRA fine-tuned version of Llama 3 or Mistral trained on explaining concepts at different expertise levels     | Fine-tuning, LoRA, dataset curation, training loops, evaluation metrics, model comparison               |

---

## 3. Detailed Feature Breakdown

### 3.1 The Agent Loop (the brain)

This is the central Python script that orchestrates everything. It's a while loop that keeps running until the agent has enough information to answer the user's question.

**How it works step by step:**

1. User asks a question (e.g., "What does this equation mean?")
2. Agent receives the question + current reading position (which paper, which section)
3. Agent decides: "Do I need more context?" → If yes, picks which MCP tool to call
4. Tool returns data. Agent evaluates: "Do I have enough to answer? Or do I need another tool call?"
5. Repeats steps 3–4 until it has everything (typically 2–5 tool calls per question)
6. Assembles final context: relevant paper sections + user's knowledge state + any external explanations
7. Generates response calibrated to the user's level
8. Updates the knowledge graph based on the interaction

> The key insight: you are NOT hardcoding this flow. The LLM decides at each step which tool to call and when it has enough info. Different questions lead to completely different tool-call sequences. That's what makes it agentic.

**What you'll code:**

- A main loop in Python that manages the conversation
- System prompt that tells the agent its role, available tools, and decision-making rules
- Context assembly function that takes tool results and builds the final prompt
- Response parser that extracts tool calls from the LLM's output
- Conversation memory that tracks the current session's history

**Python libraries needed:** `anthropic` (`pip install anthropic`) — that's it for this component

---

### 3.2 Paper Parser MCP Server

This MCP server is responsible for everything related to the actual paper content. It parses PDFs, breaks them into sections, and serves specific sections to the agent on demand.

**Tools this server exposes:**

| Tool Name            | Parameters                                  | What It Does                                                                                                                                               |
| -------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse_paper`        | `pdf_path` (string)                         | Takes a PDF file, extracts all text, splits it into sections by heading, stores section data. Returns paper ID and table of contents.                      |
| `get_section`        | `paper_id` (string), `section_number` (int) | Returns the full text of a specific section. The agent uses this to pull only the section the user is currently reading.                                   |
| `get_sections_up_to` | `paper_id` (string), `section_number` (int) | Returns summaries of all sections up to the current reading position. Gives context of what the user has already read without dumping full text.           |
| `search_paper`       | `paper_id` (string), `query` (string)       | Searches within the paper for mentions of a specific concept or term. Returns relevant passages with section numbers. Uses embeddings for semantic search. |
| `get_paper_metadata` | `paper_id` (string)                         | Returns title, authors, abstract, and list of all citations referenced in the paper.                                                                       |

**What you'll learn building this:**

- PDF text extraction using PyMuPDF (`fitz`) — `pip install pymupdf`
- How to split a document into meaningful chunks (by section headings, not arbitrary line counts)
- Generating embeddings using an embedding model (OpenAI's `text-embedding-3-small` or open-source alternatives)
- Storing and searching vectors using FAISS or ChromaDB
- The MCP protocol: how to define tools, handle requests, and return responses using the MCP Python SDK

---

### 3.3 Knowledge Graph MCP Server

This is the most novel component — the one that makes your project different from every other PDF chatbot. It maintains a persistent model of what the user knows.

**How the knowledge graph works (it's simpler than it sounds):**

It's a JSON file that stores concepts and their relationships. Each concept has: a name, a confidence score (0.0 to 1.0 representing how well the user understands it), a list of prerequisites (other concepts that should be understood first), and a source (which paper/section the user learned it from).

**Example:**

```json
{
  "self_attention": {
    "confidence": 0.7,
    "prerequisites": ["matrix_multiplication", "softmax", "embeddings"],
    "source": "Attention Is All You Need, Section 3.2"
  }
}
```

**Tools this server exposes:**

| Tool Name                | Parameters                                                                           | What It Does                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_user_knowledge`     | `user_id` (string)                                                                   | Returns all concepts the user knows with confidence scores. Used by agent to understand who it's talking to.                                                              |
| `find_prerequisite_gaps` | `user_id` (string), `concept` (string)                                               | Given a target concept, checks if the user knows all prerequisites. Returns a list of missing concepts sorted by importance. This is the core intelligence of the system. |
| `add_concept`            | `user_id` (string), `concept` (string), `confidence` (float), `prerequisites` (list) | Records that the user has been exposed to a concept at a given confidence level. Called after the agent explains something.                                               |
| `update_confidence`      | `user_id` (string), `concept` (string), `new_confidence` (float)                     | Adjusts confidence up or down based on user's responses. If user seems confused, lower it. If they demonstrate understanding, raise it.                                   |
| `get_learning_path`      | `user_id` (string), `target_concept` (string)                                        | Returns an ordered list of concepts the user should learn to understand the target. Like a prerequisite chain.                                                            |

**What you'll learn building this:**

- Knowledge representation — how to model concepts and their relationships as a graph
- Persistent state management — saving and loading user data across sessions (JSON files initially, could upgrade to SQLite)
- Graph traversal — finding prerequisite chains is basically a BFS/DFS problem
- User modeling — how to represent and update a model of someone's knowledge state

---

### 3.4 Academic Search MCP Server

This server connects your agent to the outside world. When the paper's own explanation of a concept isn't good enough, the agent can search for better explanations elsewhere.

**Tools this server exposes:**

| Tool Name              | Parameters                                   | What It Does                                                                                                                                                    |
| ---------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_papers`        | `query` (string), `max_results` (int)        | Searches Semantic Scholar for papers matching a query. Returns titles, abstracts, citation counts, and paper IDs.                                               |
| `get_paper_details`    | `paper_id` (string)                          | Fetches full details for a specific paper: abstract, authors, year, citation count, and references.                                                             |
| `find_explanations`    | `concept` (string), `difficulty` (string)    | Searches for papers, tutorials, or survey articles that explain a concept well. The difficulty parameter (beginner/intermediate/advanced) helps filter results. |
| `get_citation_context` | `paper_id` (string), `citation_key` (string) | When the paper cites another work, this fetches the cited paper's abstract so the agent can provide context without the user leaving the current paper.         |

**What you'll learn building this:**

- Wrapping a REST API as MCP tools (Semantic Scholar's API is free and well-documented)
- HTTP requests in Python (the `requests` library)
- Rate limiting and error handling for external APIs
- Search result ranking and filtering

---

### 3.5 Fine-Tuned Model

This is the component that separates your project from "I just called the Claude API." You train your own model specifically for the task of explaining technical concepts at different expertise levels.

**What you're fine-tuning and why:**

You take an open-source base model (Llama 3 8B or Mistral 7B) and train it with LoRA (Low-Rank Adaptation) on a curated dataset of concept explanations. The dataset contains triplets: (concept, user's expertise level, good explanation at that level). After fine-tuning, your model should produce better-calibrated explanations than the base model.

**The dataset you'll curate (~1,000–2,000 examples):**

- Use GPT-4 or Claude to generate initial training examples: "Explain [concept] to someone who understands [prerequisites] but not [this concept]"
- Create examples at three levels: beginner (analogies, no math), intermediate (some math, builds on basics), advanced (full mathematical formulation)
- Cover concepts from papers you've actually read — attention, backprop, embeddings, loss functions, optimization, etc.
- Manually review and filter for quality — this is where the real learning happens, because you're evaluating whether explanations are actually good

**The fine-tuning process:**

1. Install HuggingFace transformers + PEFT (`pip install transformers peft datasets`)
2. Load base model + tokenizer (Llama 3 8B or Mistral 7B)
3. Prepare your dataset in the right format (instruction + input + output)
4. Configure LoRA (rank, alpha, target modules) — this is where you learn what these hyperparameters do
5. Train for 3–5 epochs, monitoring loss curves
6. Evaluate on held-out test set — compare base model vs your fine-tuned model

> You'll need GPU access for this. Options: Google Colab Pro ($10/mo), Lambda Labs, or if you have a gaming PC with an NVIDIA GPU (16GB+ VRAM), you can run it locally. Colab Pro is the easiest starting point.

**What you'll learn:**

- How fine-tuning actually works at the code level (not just vibes)
- LoRA: what low-rank matrices are, why they're efficient, how to choose rank and alpha
- Dataset curation — the most underrated skill in ML. Bad data = bad model, period
- Training loops, loss curves, overfitting detection, early stopping
- Model evaluation: metrics beyond just "it looks right"

---

## 4. Build Order (Phase by Phase)

Each phase adds exactly ONE new concept. You never learn two new things at once. Each phase produces a working, testable piece of the system.

### Phase 1: Basic API + Tool Calling (Week 5)

**Duration:** 1 weekend (~6–8 hours)
**New concept:** Anthropic API tool use

**What you build:** A Python script that sends a message to Claude with 2 tool definitions (a calculator and a dictionary lookup). Claude picks which tool to call, you execute it in Python, and send the result back. Add a while loop so it can call multiple tools before answering. This is maybe 80 lines of code.

**Done when:** You can ask "What's 234 × 567 and what does 'stochastic' mean?" and the agent calls both tools in sequence and gives you one combined answer.

---

### Phase 2: Paper Parsing + First MCP Server (Week 6)

**Duration:** 1 week (~10 hours)
**New concepts:** MCP protocol, PDF parsing

**What you build:** The Paper Parser MCP server. Read the MCP spec, install the MCP Python SDK, and create a server that exposes `parse_paper` and `get_section` tools. Use PyMuPDF to extract text from PDFs and split by section headings. Wire it to your agent loop from Phase 1 — now the agent can read papers.

**Done when:** You upload an ML paper (try "Attention Is All You Need"), the agent parses it, and you can say "Explain section 3" and it pulls just that section and explains it.

---

### Phase 3: Knowledge Graph + Second MCP Server (Week 7)

**Duration:** 1 week (~10 hours)
**New concepts:** Knowledge representation, persistent state, user modeling

**What you build:** The Knowledge Graph MCP server. Start simple: a JSON file that stores concepts with confidence scores. Implement `find_prerequisite_gaps` using BFS on the concept dependency graph. Wire it to the agent so it checks what the user knows before answering.

**Done when:** You ask about "multi-head attention" and the agent first checks whether you understand "self-attention" and "linear projections," and if not, explains those first. Close the app, reopen it, and it still remembers what you know.

---

### Phase 4: Academic Search + Third MCP Server (Week 7–8)

**Duration:** 3–4 days (~6 hours)
**New concepts:** External API integration, REST API wrapping

**What you build:** The Academic Search MCP server. Wrap the Semantic Scholar API (it's free, no API key needed for basic use). Expose `search_papers` and `get_paper_details` tools. Now when the agent encounters a citation or a concept the paper doesn't explain well, it can search for better resources.

**Done when:** The agent encounters a concept it can't explain well from the paper alone, autonomously searches Semantic Scholar for a simpler explanation, and incorporates it into its response.

---

### Phase 5: Embeddings + Smart Retrieval (Week 8–9)

**Duration:** 1 week (~10 hours)
**New concepts:** Embeddings, vector search, RAG

**What you build:** Upgrade the Paper Parser's `search_paper` tool to use embeddings instead of keyword search. Generate embeddings for each section chunk, store them in FAISS, and retrieve the most relevant chunks for a given question. This is RAG (Retrieval-Augmented Generation) and you're building it from scratch.

**Done when:** You ask a conceptual question and the agent retrieves the 3 most relevant passages from the paper (even if they're in different sections) and uses them to construct its answer. The retrieval quality is noticeably better than keyword matching.

---

### Phase 6: Fine-Tuning (Week 9–10)

**Duration:** 1.5 weeks (~15 hours)
**New concepts:** LoRA fine-tuning, dataset curation, training, evaluation

**What you build:** Curate a dataset of 1–2K (concept, expertise_level, explanation) examples. Fine-tune Llama 3 8B or Mistral 7B with LoRA using HuggingFace PEFT. Integrate the fine-tuned model as an optional backend — the agent can use either Claude API or your fine-tuned model for generating explanations.

**Done when:** You can toggle between Claude and your fine-tuned model, and your model produces noticeably more calibrated explanations for concepts in its training domain.

---

### Phase 7: Evaluation + Benchmarking (Week 10–11)

**Duration:** 1 week (~12 hours)
**New concepts:** Rigorous evaluation, benchmarking methodology, technical writing

**What you build:** A benchmark of 20–30 questions across 5 papers at varying difficulty levels. Run your agent with: (a) base Llama 3, (b) your fine-tuned model, (c) Claude/GPT-4. Measure explanation accuracy, calibration quality (did it match the user's level?), prerequisite gap detection accuracy, latency, and cost per question. Write results into your README with tables.

**Done when:** Your README has a benchmark results table showing exactly how each model performed, with specific numbers. You can articulate why your fine-tuned model wins or loses on specific categories.

---

## 5. Project File Structure

This is what your GitHub repo looks like when it's done. Every file has a purpose.

```
paper-agent/
├─ agent/                        ← The brain
│  ├─ main.py                    ← Entry point, runs the agent loop
│  ├─ loop.py                    ← ReAct loop logic
│  ├─ context.py                 ← Context assembly (decides what goes into the prompt)
│  └─ prompts.py                 ← System prompts and templates
├─ mcp_servers/                  ← Your three tool servers
│  ├─ paper_parser/              ← PDF parsing + section extraction + embeddings
│  ├─ knowledge_graph/           ← User knowledge tracking + prerequisite gaps
│  └─ academic_search/           ← Semantic Scholar API wrapper
├─ fine_tuning/                  ← Model training
│  ├─ data/                      ← Your curated training dataset
│  ├─ train.py                   ← LoRA fine-tuning script
│  └─ evaluate.py                ← Model comparison and metrics
├─ evaluation/                   ← Benchmarking
│  ├─ benchmark.py               ← Runs all benchmark tests
│  ├─ test_questions.json        ← Your 20–30 test cases
│  └─ results/                   ← Output data and charts
├─ data/                         ← Stored knowledge graphs and parsed papers
├─ README.md                     ← Architecture diagram, setup, benchmark results
├─ requirements.txt              ← All Python dependencies
└─ .github/workflows/            ← CI pipeline
```

---

## 6. What Makes This Impressive to Recruiters

| Company       | Why They'd Be Impressed                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI**    | You built a product on top of LLMs that solves a real problem. You understand tool use, context management, and RAG — exactly what their Applied team works on daily. The fine-tuning shows you can go deeper than API calls.                 |
| **Anthropic** | The knowledge modeling component touches user modeling and calibrated AI responses — core to how Claude is designed. The from-scratch approach (no LangChain) shows real engineering understanding. MCP servers are literally their protocol. |
| **Google**    | The system architecture (multiple services communicating via a protocol, embeddings pipeline, search + retrieval) mirrors how Google's AI products are built. The evaluation methodology shows scientific rigor.                              |
| **Citadel**   | The benchmark results with cost/latency analysis shows you think quantitatively about system performance. The fine-tuning comparison with actual metrics shows data-driven decision making.                                                   |
| **Roblox**    | The full-stack backend architecture (multiple servers, persistent storage, API integration) directly maps to how Roblox backend services work. Shows you can build and ship a complete system.                                                |

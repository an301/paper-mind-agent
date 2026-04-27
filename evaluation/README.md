# Evaluation Harness

A measurement-first benchmark for paper-mind-agent. Runs a 12-question corpus across 6 systems (baselines + ablations + production) and scores each output for correctness, groundedness, and spoiler-respect via LLM-as-judge.

## What it measures

| ID | System | What it isolates |
|----|--------|------------------|
| B0.5 | Claude + abstract + section names only | Training-data + structural prior (the real null) |
| B1 | Claude + full paper text in context | Brute-force upper bound (skipped if paper exceeds context) |
| A0 | Agent + system prompt, no MCP tools | System-prompt effect alone |
| A1 | Agent + paper_parser only | Retrieval-tool effect, isolated |
| A2 | Agent + knowledge_graph only | Groundedness null — paper-content claims indicate training-data leak |
| A3 | Agent + both MCPs | Production system |

**Metrics:**
- **Correctness** (0–3, LLM-as-judge against `gold_answer_keypoints`)
- **Groundedness** (0–3, LLM-as-judge — uses paper content vs. hallucinates)
- **Spoiler-respect** (binary; deterministic canary check, then LLM judge for subtle leaks)
- **Tool appropriateness** (Jaccard over `expected_tool_families`; A1/A2/A3 only)
- **Telemetry**: latency, input/output tokens, cost (USD)

## Running

```sh
# Quick pilot (3 questions × all 6 systems)
python -m evaluation.benchmark --systems all --questions Q001,Q002,Q003 --cost-budget 1.0

# Full eval
python -m evaluation.benchmark --systems all --cost-budget 5.0

# One system only
python -m evaluation.benchmark --systems A3 --cost-budget 1.0

# Inter-judge agreement (Sonnet-4 vs Haiku-4.5, Cohen's kappa)
python -m evaluation.benchmark --systems A3 --questions Q001,Q002,Q003 --check-judge-agreement
```

Each run writes to `results/run-{timestamp}-{git_sha}/`:
- `traces.jsonl` — full conversation trace per (system, question)
- `summary.json` — aggregated metrics + run config
- `report.md` — human-readable summary tables
- `telemetry.csv` — per-row telemetry for spreadsheet analysis
- `config.json` — model, judge_version, corpus_version, git_sha, args, actual cost

## Caveats / known limitations

- **n=12, 2 papers.** This is the MVP corpus. Aggregate metrics across so few questions have wide error bars; sample traces and per-question inspection are at least as important as table numbers. Adding a 3rd paper (DDPM canonical) is the next corpus expansion.
- **Judge not yet human-calibrated.** The `--check-judge-agreement` flag gives inter-judge kappa (Sonnet vs Haiku) as a sanity check, but human-labeled ground truth on a subset of outputs is the real next step before publishing any number.
- **B1 spoiler scores are expected to be low** — when the model has the entire paper in context, leak avoidance falls entirely on the spoiler rule in the prompt. That's the point of B1 as an upper-bound baseline, not a recommendation.
- **Sonnet-4 (claude-sonnet-4-20250514) is the production agent model** as defined in `agent/loop.py`. Eval uses the same model for fairness. If the production model is upgraded, re-run baselines.
- **KG mutations from one (system, question) leak into the next** unless we use per-run unique user_ids. Currently the agent uses the default user_id — fix this if KG-update-accuracy becomes a metric.

## Files

```
evaluation/
├── README.md                 (this file)
├── __init__.py               (empty — makes this a package)
├── test_questions.json       (12-question corpus, schema documented inline)
├── benchmark.py              (orchestrator; CLI entry)
├── runners.py                (six runners, identical telemetry shape)
├── judge.py                  (3 judge functions; canary check + LLM)
├── metrics.py                (aggregations, win-rate matrix, Cohen's kappa, MD rendering)
├── prompts/
│   ├── judge_correctness.md  (rubric v1.0)
│   ├── judge_groundedness.md (rubric v1.0)
│   └── judge_spoiler.md      (rubric v1.0)
├── fixtures/
│   ├── positions.json        (frozen reading-positions snapshot)
│   └── paper_pages/          (per-page text, used by judges)
└── results/
    └── .gitignore            (results dir is gitignored)
```

## Schema: `test_questions.json`

```json
{
  "id": "Q001",
  "paper_id": "0a49ef88",
  "paper_title": "...",
  "question": "...",
  "gold_answer": "...",
  "gold_answer_keypoints": ["claim 1", "claim 2", ...],
  "difficulty": "factual" | "conceptual" | "multi_hop",
  "expected_section": "...",
  "current_page_context": 4,
  "max_page_read": 4,
  "must_not_spoil_pages_after": 4,
  "spoiler_canaries": ["term1", "term2"],
  "expected_tool_families": ["retrieval"],
  "b1_eligible": true
}
```

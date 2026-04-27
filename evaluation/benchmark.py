"""Benchmark orchestrator for the paper-mind-agent eval harness.

Runs a corpus of test questions through one or more systems, scores each
output via the LLM judges, aggregates results, and writes a per-run results
directory with traces, summary, report, telemetry CSV, and config stamp.

Usage:
    python -m evaluation.benchmark --systems all --questions Q001,Q002,Q003 --cost-budget 1.0
    python -m evaluation.benchmark --systems A3 --questions Q001,Q002 --check-judge-agreement
"""

import argparse
import asyncio
import csv
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.parent
load_dotenv(_PROJECT_ROOT / ".env")

if str(_PROJECT_ROOT / "agent") not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT / "agent"))

from runtime import agent_runtime  # noqa: E402

from evaluation.judge import (  # noqa: E402
    JUDGE_VERSION,
    judge_correctness,
    judge_groundedness,
    judge_spoiler,
)
from evaluation.metrics import (  # noqa: E402
    aggregate_by_system,
    cohens_kappa,
    render_summary_markdown,
)
from evaluation.runners import (  # noqa: E402
    DEFAULT_MODEL,
    RUNNERS,
    estimate_cost,
)


def _git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(_PROJECT_ROOT),
            text=True,
        ).strip()
    except Exception:
        return "unknown"


def _load_corpus() -> dict:
    return json.loads((_HERE / "test_questions.json").read_text())


def _select_questions(all_questions: list[dict], filter_arg: str | None) -> list[dict]:
    if not filter_arg or filter_arg == "all":
        return all_questions
    ids = {x.strip() for x in filter_arg.split(",") if x.strip()}
    return [q for q in all_questions if q["id"] in ids]


def _select_systems(filter_arg: str | None) -> list[str]:
    if not filter_arg or filter_arg == "all":
        return ["B0.5", "B1", "A0", "A1", "A2", "A3"]
    return [s.strip() for s in filter_arg.split(",") if s.strip()]


async def _prewarm_parsers(mcp, questions):
    unique = {(q["paper_id"], q["paper_title"]) for q in questions}
    for pid, _title in unique:
        pdf_path = str(_PROJECT_ROOT / "data" / "papers" / f"{pid}.pdf")
        if Path(pdf_path).exists():
            try:
                await mcp.call_tool("parse_paper", {"pdf_path": pdf_path, "paper_id": pid})
                print(f"  Pre-warmed parser for {pid}")
            except Exception as e:
                print(f"  WARN: failed to pre-warm {pid}: {e}")


async def _run_one(
    system: str,
    question: dict,
    client,
    mcp,
    judge_model: str,
    semaphore: asyncio.Semaphore,
    state: dict,
) -> dict:
    async with semaphore:
        if state["cost_total"] > state["cost_budget"]:
            return {"skipped_due_to_budget": True, "system": system, "question_id": question["id"]}

        runner = RUNNERS[system]
        try:
            answer, telemetry = await runner(question, client, mcp)
        except Exception as e:
            return _error_row(system, question, f"RUNNER_ERROR: {e}")

        try:
            c_result, c_tel = await judge_correctness(answer, question, client, judge_model)
            g_result, g_tel = await judge_groundedness(answer, question, client, judge_model)
            s_result, s_tel = await judge_spoiler(answer, question, client, judge_model)
        except Exception as e:
            return _error_row(system, question, f"JUDGE_ERROR: {e}", answer=answer, telemetry=telemetry)

        judge_cost = sum(
            estimate_cost(t.get("input_tokens", 0), t.get("output_tokens", 0), t.get("model", judge_model))
            for t in [c_tel, g_tel, s_tel]
        )
        run_cost = telemetry.get("cost_usd", 0.0) + judge_cost

        async with state["lock"]:
            state["cost_total"] += run_cost

        return {
            "system": system,
            "question_id": question["id"],
            "question": question,
            "answer": answer,
            "telemetry": telemetry,
            "judge_telemetry": {
                "correctness": c_tel,
                "groundedness": g_tel,
                "spoiler": s_tel,
                "judge_cost_usd": judge_cost,
            },
            "correctness": c_result,
            "groundedness": g_result,
            "spoiler": s_result,
            "correctness_score": c_result.get("score", 0),
            "groundedness_score": g_result.get("score", 0),
            "spoiler_pass": bool(s_result.get("pass", False)),
            "judge_version": JUDGE_VERSION,
            "judge_model": judge_model,
        }


def _error_row(system, question, error_msg, answer="[ERROR]", telemetry=None):
    return {
        "system": system,
        "question_id": question["id"],
        "question": question,
        "answer": answer,
        "telemetry": telemetry or {
            "system": system, "model": "error", "cost_usd": 0.0,
            "latency_seconds": 0.0, "input_tokens": 0, "output_tokens": 0,
            "num_tool_calls": 0, "tool_calls": [], "tool_families_called": [],
        },
        "correctness": {"score": 0, "reasoning": error_msg},
        "groundedness": {"score": 0, "reasoning": error_msg},
        "spoiler": {"pass": True, "method": "skipped", "reasoning": error_msg},
        "correctness_score": 0,
        "groundedness_score": 0,
        "spoiler_pass": True,
        "judge_version": JUDGE_VERSION,
        "error": error_msg,
    }


async def main_async(args):
    corpus = _load_corpus()
    questions = _select_questions(corpus["questions"], args.questions)
    systems = _select_systems(args.systems)

    if not questions:
        print("No questions selected.")
        return 1

    print(f"Eval plan: {len(systems)} systems × {len(questions)} questions = {len(systems)*len(questions)} runs")
    print(f"Cost budget: ${args.cost_budget}  |  Concurrency: {args.concurrency}  |  Judge: {args.judge_model}\n")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    git_sha = _git_sha()
    out_dir = _HERE / "results" / f"run-{timestamp}-{git_sha}"
    out_dir.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(args.concurrency)
    state = {"cost_total": 0.0, "cost_budget": args.cost_budget, "lock": asyncio.Lock()}
    results: list[dict] = []

    async with agent_runtime(verbose=True) as (client, mcp):
        await _prewarm_parsers(mcp, questions)

        tasks = [
            _run_one(system, q, client, mcp, args.judge_model, semaphore, state)
            for system in systems for q in questions
        ]

        for coro in asyncio.as_completed(tasks):
            result = await coro
            if result.get("skipped_due_to_budget"):
                continue
            results.append(result)
            cs = result.get("correctness_score", "?")
            gs = result.get("groundedness_score", "?")
            sp = "✓" if result.get("spoiler_pass") else "✗"
            print(
                f"  [{result['system']:>4} {result['question_id']}] "
                f"correctness={cs} groundedness={gs} spoiler={sp}  "
                f"(spent: ${state['cost_total']:.3f})"
            )

    config = {
        "timestamp": timestamp,
        "git_sha": git_sha,
        "judge_version": JUDGE_VERSION,
        "judge_model": args.judge_model,
        "agent_model": DEFAULT_MODEL,
        "corpus_version": corpus.get("corpus_version"),
        "systems": systems,
        "question_ids": [q["id"] for q in questions],
        "cost_budget": args.cost_budget,
        "cost_actual": state["cost_total"],
        "concurrency": args.concurrency,
    }
    (out_dir / "config.json").write_text(json.dumps(config, indent=2))

    with (out_dir / "traces.jsonl").open("w") as f:
        for r in results:
            f.write(json.dumps(r, default=str) + "\n")

    summary = aggregate_by_system(results)
    summary_serializable = {
        sys_id: {k: list(v) if isinstance(v, tuple) else v for k, v in s.items()}
        for sys_id, s in summary.items()
    }
    (out_dir / "summary.json").write_text(
        json.dumps({"config": config, "per_system": summary_serializable}, indent=2, default=str)
    )

    report = render_summary_markdown(results)
    (out_dir / "report.md").write_text(
        f"# Run {timestamp} ({git_sha})\n\n"
        f"- Judge: `{args.judge_model}` ({JUDGE_VERSION})\n"
        f"- Agent: `{DEFAULT_MODEL}`\n"
        f"- Corpus: `{corpus.get('corpus_version')}`\n"
        f"- Cost: ${state['cost_total']:.3f} of ${args.cost_budget}\n\n"
        + report
    )

    with (out_dir / "telemetry.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow([
            "system", "question_id", "difficulty", "model", "latency_s",
            "input_tokens", "output_tokens", "num_tool_calls",
            "tool_families_called", "cost_usd",
            "correctness", "groundedness", "spoiler_pass", "spoiler_method",
        ])
        for r in results:
            t = r["telemetry"]
            w.writerow([
                r["system"], r["question_id"],
                r.get("question", {}).get("difficulty"),
                t.get("model"), f"{t.get('latency_seconds', 0):.2f}",
                t.get("input_tokens"), t.get("output_tokens"),
                t.get("num_tool_calls"),
                "+".join(t.get("tool_families_called", [])),
                f"{t.get('cost_usd', 0):.4f}",
                r.get("correctness_score"),
                r.get("groundedness_score"),
                int(r.get("spoiler_pass", False)),
                r.get("spoiler", {}).get("method", "?"),
            ])

    print(f"\nResults: {out_dir}")
    print(f"Total cost: ${state['cost_total']:.3f}")
    return 0


async def kappa_check_async(args):
    corpus = _load_corpus()
    questions = _select_questions(corpus["questions"], args.questions)
    systems = _select_systems(args.systems)

    if not questions or not systems:
        print("Need at least one system and one question for kappa check.")
        return 1

    print(f"Kappa check: {len(systems)} systems × {len(questions)} questions = {len(systems)*len(questions)} answers")
    print(f"Judge A: {args.judge_model}  |  Judge B: {args.judge_model_b}\n")

    semaphore = asyncio.Semaphore(args.concurrency)

    async with agent_runtime(verbose=True) as (client, mcp):
        await _prewarm_parsers(mcp, questions)

        async def _gen(system, q):
            async with semaphore:
                ans, _tel = await RUNNERS[system](q, client, mcp)
                return q, ans

        gen_tasks = [_gen(s, q) for s in systems for q in questions]
        answers: list[tuple[dict, str]] = []
        for coro in asyncio.as_completed(gen_tasks):
            q, ans = await coro
            answers.append((q, ans))
            print(f"  generated answer for {q['id']}")

        scores_a, scores_b = [], []
        ground_a, ground_b = [], []
        spoiler_a, spoiler_b = [], []
        for q, ans in answers:
            ca, _ = await judge_correctness(ans, q, client, args.judge_model)
            cb, _ = await judge_correctness(ans, q, client, args.judge_model_b)
            ga, _ = await judge_groundedness(ans, q, client, args.judge_model)
            gb, _ = await judge_groundedness(ans, q, client, args.judge_model_b)
            sa, _ = await judge_spoiler(ans, q, client, args.judge_model)
            sb, _ = await judge_spoiler(ans, q, client, args.judge_model_b)
            scores_a.append(ca.get("score", 0))
            scores_b.append(cb.get("score", 0))
            ground_a.append(ga.get("score", 0))
            ground_b.append(gb.get("score", 0))
            spoiler_a.append(1 if sa.get("pass") else 0)
            spoiler_b.append(1 if sb.get("pass") else 0)
            print(f"  judged {q['id']}: corr A={ca.get('score')} B={cb.get('score')}")

        kappa_correct = cohens_kappa(scores_a, scores_b, [0, 1, 2, 3])
        kappa_ground = cohens_kappa(ground_a, ground_b, [0, 1, 2, 3])
        kappa_spoiler = cohens_kappa(spoiler_a, spoiler_b, [0, 1])

        print()
        print("=== Inter-judge agreement (Cohen's kappa) ===")
        print(f"  Correctness:    kappa = {kappa_correct:.3f}")
        print(f"  Groundedness:   kappa = {kappa_ground:.3f}")
        print(f"  Spoiler-pass:   kappa = {kappa_spoiler:.3f}")
        print()
        for k, name in [(kappa_correct, "correctness"), (kappa_ground, "groundedness"), (kappa_spoiler, "spoiler")]:
            label = "ACCEPTABLE (>=0.7)" if k >= 0.7 else "MODERATE (0.4-0.7)" if k >= 0.4 else "POOR (<0.4)"
            print(f"  {name}: {label}")
    return 0


def main():
    parser = argparse.ArgumentParser(description="paper-mind-agent eval harness")
    parser.add_argument("--systems", default="all",
                        help="Comma-sep list or 'all'. Options: B0.5,B1,A0,A1,A2,A3")
    parser.add_argument("--questions", default="all", help="Comma-sep question IDs or 'all'")
    parser.add_argument("--cost-budget", type=float, default=5.0, help="USD ceiling")
    parser.add_argument("--concurrency", type=int, default=4, help="asyncio.Semaphore size")
    parser.add_argument("--judge-model", default=DEFAULT_MODEL, help="Primary judge model")
    parser.add_argument("--judge-model-b", default="claude-haiku-4-5-20251001",
                        help="Second judge for --check-judge-agreement")
    parser.add_argument("--check-judge-agreement", action="store_true",
                        help="Run kappa check between two judge models")
    args = parser.parse_args()

    if args.check_judge_agreement:
        return asyncio.run(kappa_check_async(args))
    return asyncio.run(main_async(args))


if __name__ == "__main__":
    sys.exit(main() or 0)

"""Deep analysis of a benchmark run.

Goes beyond the canned report.md — surfaces:
    1. Per-question matrix (which systems got each question right)
    2. A1 vs A3 pairwise diff (where adding KG helps, hurts, or no-ops)
    3. Tool-call efficiency (calls per system, redundant search detection)
    4. Spoiler failure breakdown (canary hits vs LLM-flagged subtle leaks)
    5. Cost-per-correctness-point (efficiency frontier)

Usage:
    python -m evaluation.analyze                           # latest run
    python -m evaluation.analyze --run run-20260427-...    # specific run
"""

import argparse
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

_HERE = Path(__file__).resolve().parent


def load_run(run_dir: Path) -> tuple[dict, list[dict]]:
    config = json.loads((run_dir / "config.json").read_text())
    rows = []
    with (run_dir / "traces.jsonl").open() as f:
        for line in f:
            rows.append(json.loads(line))
    return config, rows


def latest_run() -> Path:
    runs = sorted((_HERE / "results").glob("run-*"))
    return runs[-1] if runs else None


def per_question_matrix(rows: list[dict]) -> str:
    """For each question, show correctness/spoiler across all systems."""
    by_q: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        by_q[r["question_id"]][r["system"]] = r

    systems = sorted({r["system"] for r in rows})
    lines = ["## Per-question correctness matrix\n"]
    lines.append("Format: `correctness/spoiler` (S=spoiler-fail, ✓=pass)\n")
    header = "| Question | Difficulty | " + " | ".join(systems) + " |"
    lines.append(header)
    lines.append("|---|---|" + "|".join(["---"] * len(systems)) + "|")

    for qid in sorted(by_q.keys()):
        first = next(iter(by_q[qid].values()))
        diff = first.get("question", {}).get("difficulty", "?")
        cells = []
        for s in systems:
            entry = by_q[qid].get(s)
            if not entry:
                cells.append("—")
                continue
            c = entry.get("correctness_score", "?")
            sp = "✓" if entry.get("spoiler_pass") else "S"
            cells.append(f"{c}/{sp}")
        lines.append(f"| {qid} | {diff} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def a1_vs_a3_diff(rows: list[dict]) -> str:
    """Question-by-question diff between A1 (paper_parser only) and A3 (full agent).

    The single most interesting comparison: does adding KG to retrieval help?
    """
    by_q: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        by_q[r["question_id"]][r["system"]] = r

    lines = ["\n## A1 (paper_parser only) vs A3 (full agent)\n"]
    lines.append("Where does adding the KG to retrieval help, hurt, or no-op?\n")
    lines.append("| Question | A1 corr | A3 corr | Δ | A1 tools | A3 tools | A1 cost | A3 cost |")
    lines.append("|---|---|---|---|---|---|---|---|")

    n_a1_wins = n_a3_wins = n_ties = 0
    a1_total_cost = a3_total_cost = 0.0
    a1_total_tools = a3_total_tools = 0

    for qid in sorted(by_q.keys()):
        a1 = by_q[qid].get("A1")
        a3 = by_q[qid].get("A3")
        if not a1 or not a3:
            continue
        ac = a1.get("correctness_score", 0)
        bc = a3.get("correctness_score", 0)
        delta = bc - ac
        if delta > 0:
            n_a3_wins += 1
            sym = f"**+{delta} (A3)**"
        elif delta < 0:
            n_a1_wins += 1
            sym = f"**{delta} (A1)**"
        else:
            n_ties += 1
            sym = "tie"
        a1_calls = a1["telemetry"].get("num_tool_calls", 0)
        a3_calls = a3["telemetry"].get("num_tool_calls", 0)
        a1_cost = a1["telemetry"].get("cost_usd", 0)
        a3_cost = a3["telemetry"].get("cost_usd", 0)
        a1_total_cost += a1_cost
        a3_total_cost += a3_cost
        a1_total_tools += a1_calls
        a3_total_tools += a3_calls
        lines.append(
            f"| {qid} | {ac} | {bc} | {sym} | {a1_calls} | {a3_calls} | "
            f"${a1_cost:.3f} | ${a3_cost:.3f} |"
        )

    n = n_a1_wins + n_a3_wins + n_ties
    if n:
        lines.append(f"\n**Summary** (n={n}): A3 wins {n_a3_wins}, A1 wins {n_a1_wins}, ties {n_ties}.")
        lines.append(
            f"A3 spent ${a3_total_cost - a1_total_cost:+.2f} more than A1 "
            f"and made {a3_total_tools - a1_total_tools:+d} more tool calls. "
            f"Cost ratio: ${a3_total_cost:.2f} / ${a1_total_cost:.2f} = "
            f"{(a3_total_cost / a1_total_cost) if a1_total_cost else 0:.2f}×."
        )
    return "\n".join(lines)


def tool_call_efficiency(rows: list[dict]) -> str:
    """Per-system tool-call distribution + redundant-search detection."""
    by_system: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_system[r["system"]].append(r)

    lines = ["\n## Tool-call efficiency\n"]
    lines.append("| System | n | Mean calls | Median | Max | Mean redundant searches | Most-called tool |")
    lines.append("|---|---|---|---|---|---|---|")

    for system in sorted(by_system.keys()):
        srows = by_system[system]
        call_counts = [r["telemetry"].get("num_tool_calls", 0) for r in srows]
        if not any(call_counts):
            lines.append(f"| {system} | {len(srows)} | 0 | 0 | 0 | — | — |")
            continue
        mean = statistics.fmean(call_counts)
        med = statistics.median(call_counts)
        mx = max(call_counts)

        # Redundancy: count duplicate calls within a single run
        redundancies = []
        all_tool_names = []
        for r in srows:
            calls = r["telemetry"].get("tool_calls", [])
            counter = Counter(calls)
            redundant = sum(c - 1 for c in counter.values() if c > 1)
            redundancies.append(redundant)
            all_tool_names.extend(calls)
        mean_redundant = statistics.fmean(redundancies) if redundancies else 0
        most_called = Counter(all_tool_names).most_common(1)
        most_str = f"{most_called[0][0]} ({most_called[0][1]}×)" if most_called else "—"
        lines.append(
            f"| {system} | {len(srows)} | {mean:.1f} | {med:.0f} | {mx} | "
            f"{mean_redundant:.1f} | {most_str} |"
        )
    return "\n".join(lines)


def spoiler_breakdown(rows: list[dict]) -> str:
    """Where do spoilers fail — canary hits vs LLM-judged subtle leaks."""
    lines = ["\n## Spoiler-failure breakdown\n"]
    lines.append("| System | Pass | Canary fail | LLM fail | No-later-content |")
    lines.append("|---|---|---|---|---|")

    by_system: dict[str, dict[str, int]] = defaultdict(lambda: {"pass": 0, "canary": 0, "llm": 0, "no_later": 0})
    for r in rows:
        sys = r["system"]
        sp = r.get("spoiler", {})
        method = sp.get("method", "?")
        if r.get("spoiler_pass"):
            by_system[sys]["pass"] += 1
        else:
            if method == "canary":
                by_system[sys]["canary"] += 1
            elif method == "llm":
                by_system[sys]["llm"] += 1
            else:
                by_system[sys]["no_later"] += 1

    for system in sorted(by_system.keys()):
        s = by_system[system]
        lines.append(f"| {system} | {s['pass']} | {s['canary']} | {s['llm']} | {s['no_later']} |")

    # List the most-hit canaries
    canary_hits: Counter = Counter()
    for r in rows:
        sp = r.get("spoiler", {})
        if not r.get("spoiler_pass") and sp.get("method") == "canary":
            leaked = sp.get("leaked_content", "")
            # Parse "Canary terms detected: ['X', 'Y']" if present
            if "[" in leaked and "]" in leaked:
                inside = leaked[leaked.index("[") + 1 : leaked.rindex("]")]
                terms = [t.strip().strip("'\"") for t in inside.split(",")]
                for t in terms:
                    canary_hits[t] += 1

    if canary_hits:
        lines.append("\n**Canary terms most often hit (potential false-positives if these are also in earlier pages):**")
        for term, count in canary_hits.most_common(10):
            lines.append(f"  - `{term}` × {count}")
    return "\n".join(lines)


def cost_efficiency(rows: list[dict]) -> str:
    """Cost per correctness point — which system is most efficient?"""
    by_system: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_system[r["system"]].append(r)

    lines = ["\n## Cost efficiency (correctness per $)\n"]
    lines.append("| System | Total $ | Total correctness | $ per correctness pt | $ per question |")
    lines.append("|---|---|---|---|---|")
    for system in sorted(by_system.keys()):
        srows = by_system[system]
        total_cost = sum(r["telemetry"].get("cost_usd", 0) for r in srows)
        total_correct = sum(r.get("correctness_score", 0) for r in srows)
        per_pt = total_cost / total_correct if total_correct else float("inf")
        per_q = total_cost / len(srows) if srows else 0
        per_pt_str = f"${per_pt:.4f}" if total_correct else "—"
        lines.append(
            f"| {system} | ${total_cost:.3f} | {total_correct} | "
            f"{per_pt_str} | ${per_q:.3f} |"
        )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Deep-analyze a benchmark run")
    parser.add_argument("--run", help="Run directory name (e.g. run-20260427-...)")
    parser.add_argument("--output", help="Write to file instead of stdout")
    args = parser.parse_args()

    run_dir = (_HERE / "results" / args.run) if args.run else latest_run()
    if not run_dir or not run_dir.exists():
        print("No run directory found.")
        return 1

    config, rows = load_run(run_dir)
    sections = [
        f"# Deep analysis: {run_dir.name}\n",
        f"- Judge: `{config.get('judge_model')}` ({config.get('judge_version')})",
        f"- Agent: `{config.get('agent_model')}`",
        f"- Corpus: `{config.get('corpus_version')}` ({len(config.get('question_ids', []))} questions)",
        f"- Total cost: ${config.get('cost_actual', 0):.3f}",
        "",
        per_question_matrix(rows),
        a1_vs_a3_diff(rows),
        tool_call_efficiency(rows),
        spoiler_breakdown(rows),
        cost_efficiency(rows),
    ]
    output = "\n".join(sections)
    if args.output:
        Path(args.output).write_text(output)
        print(f"Wrote {args.output}")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main() or 0)

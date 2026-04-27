"""Aggregation, kappa, and report rendering for the eval harness.

Inputs are flat lists of result rows: each row is one (system, question)
pair with judge scores and telemetry. Outputs are summary tables.
"""

import math
import statistics
from collections import defaultdict
from typing import Iterable


def _mean_stderr(values: list[float]) -> tuple[float, float]:
    """Return (mean, stderr-of-mean) over a list. stderr = stdev / sqrt(n)."""
    if not values:
        return float("nan"), float("nan")
    mean = statistics.fmean(values)
    if len(values) < 2:
        return mean, 0.0
    sd = statistics.stdev(values)
    return mean, sd / math.sqrt(len(values))


def _jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    return len(sa & sb) / len(sa | sb)


def aggregate_by_system(rows: list[dict]) -> dict[str, dict]:
    """Group rows by system. For each system, compute per-metric mean+stderr."""
    by_system: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_system[row["system"]].append(row)

    out = {}
    for system, srows in by_system.items():
        correctness = [r["correctness_score"] for r in srows]
        groundedness = [r["groundedness_score"] for r in srows]
        spoiler_pass = [1.0 if r["spoiler_pass"] else 0.0 for r in srows]
        latency = [r["telemetry"].get("latency_seconds", 0.0) for r in srows]
        cost = [r["telemetry"].get("cost_usd", 0.0) for r in srows]
        in_tok = [r["telemetry"].get("input_tokens", 0) for r in srows]
        out_tok = [r["telemetry"].get("output_tokens", 0) for r in srows]
        n_tools = [r["telemetry"].get("num_tool_calls", 0) for r in srows]

        # Tool-appropriateness only meaningful for agent runs that had expected_tool_families
        tool_jaccards = []
        for r in srows:
            expected = set(r.get("question", {}).get("expected_tool_families", []))
            actual = set(r["telemetry"].get("tool_families_called", []))
            if expected:
                tool_jaccards.append(_jaccard(expected, actual))

        out[system] = {
            "n": len(srows),
            "correctness_mean": _mean_stderr(correctness),
            "groundedness_mean": _mean_stderr(groundedness),
            "spoiler_pass_rate": _mean_stderr(spoiler_pass),
            "latency_mean": _mean_stderr(latency),
            "cost_total": sum(cost),
            "tokens_in_total": sum(in_tok),
            "tokens_out_total": sum(out_tok),
            "tool_calls_total": sum(n_tools),
            "tool_appropriateness": _mean_stderr(tool_jaccards) if tool_jaccards else (float("nan"), float("nan")),
        }
    return out


def win_rate_matrix(rows: list[dict], metric: str = "correctness_score") -> dict[str, dict[str, float]]:
    """For each (system_X, system_Y), fraction of questions where X strictly beats Y on `metric`."""
    by_qs: dict[tuple[str, str], float] = {}
    systems: set[str] = set()
    for row in rows:
        by_qs[(row["question_id"], row["system"])] = row[metric]
        systems.add(row["system"])

    question_ids = sorted({qid for (qid, _) in by_qs.keys()})
    matrix: dict[str, dict[str, float]] = {}
    for sx in sorted(systems):
        matrix[sx] = {}
        for sy in sorted(systems):
            if sx == sy:
                matrix[sx][sy] = float("nan")
                continue
            wins = 0
            valid = 0
            for qid in question_ids:
                vx = by_qs.get((qid, sx))
                vy = by_qs.get((qid, sy))
                if vx is None or vy is None:
                    continue
                valid += 1
                if vx > vy:
                    wins += 1
            matrix[sx][sy] = (wins / valid) if valid else float("nan")
    return matrix


def by_difficulty(rows: list[dict]) -> dict[str, dict[str, dict]]:
    """Per-system breakdown split by question difficulty."""
    out: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        diff = row.get("question", {}).get("difficulty", "unknown")
        out[row["system"]][diff].append(row)

    summary: dict[str, dict[str, dict]] = {}
    for system, diff_groups in out.items():
        summary[system] = {}
        for diff, drows in diff_groups.items():
            correctness = [r["correctness_score"] for r in drows]
            summary[system][diff] = {
                "n": len(drows),
                "correctness_mean": _mean_stderr(correctness),
            }
    return summary


def cohens_kappa(rater1: list[int], rater2: list[int], categories: list[int]) -> float:
    """Cohen's kappa for two raters on the same items.

    For ordinal scores 0-3 we treat them as categorical here — that's a
    conservative choice; weighted kappa would give partial credit for
    near-misses but the simple version is fine for a "are the judges
    even agreeing?" sanity check.
    """
    if len(rater1) != len(rater2) or not rater1:
        return float("nan")
    n = len(rater1)
    # Observed agreement
    agree = sum(1 for a, b in zip(rater1, rater2) if a == b)
    po = agree / n
    # Expected agreement by chance
    pe = 0.0
    for c in categories:
        p1 = sum(1 for x in rater1 if x == c) / n
        p2 = sum(1 for x in rater2 if x == c) / n
        pe += p1 * p2
    if pe >= 1.0:
        return 1.0 if po >= 1.0 else float("nan")
    return (po - pe) / (1 - pe)


# --- Rendering ---

def _fmt_pair(pair: tuple[float, float], decimals: int = 2) -> str:
    m, se = pair
    if math.isnan(m):
        return "—"
    return f"{m:.{decimals}f} ± {se:.{decimals}f}"


def render_summary_markdown(rows: list[dict]) -> str:
    summary = aggregate_by_system(rows)
    diffs = by_difficulty(rows)
    wins = win_rate_matrix(rows)

    lines = ["# Eval summary\n"]
    lines.append(f"Total runs: {len(rows)} across {len(summary)} systems\n")

    # Per-system table
    lines.append("## Per-system metrics\n")
    lines.append("| System | n | Correctness | Groundedness | Spoiler-pass | Tool-approp | Latency (s) | $ |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for system in sorted(summary.keys()):
        s = summary[system]
        lines.append(
            f"| {system} | {s['n']} | "
            f"{_fmt_pair(s['correctness_mean'])} | "
            f"{_fmt_pair(s['groundedness_mean'])} | "
            f"{_fmt_pair(s['spoiler_pass_rate'], decimals=2)} | "
            f"{_fmt_pair(s['tool_appropriateness'], decimals=2)} | "
            f"{_fmt_pair(s['latency_mean'], decimals=1)} | "
            f"${s['cost_total']:.3f} |"
        )

    # Win-rate matrix on correctness
    lines.append("\n## Win-rate matrix (correctness; row beats column %)\n")
    systems_sorted = sorted(wins.keys())
    header = "| ↓ vs → | " + " | ".join(systems_sorted) + " |"
    sep = "|---|" + "|".join(["---"] * len(systems_sorted)) + "|"
    lines.append(header)
    lines.append(sep)
    for sx in systems_sorted:
        cells = []
        for sy in systems_sorted:
            v = wins[sx][sy]
            cells.append("—" if math.isnan(v) else f"{v*100:.0f}%")
        lines.append(f"| {sx} | " + " | ".join(cells) + " |")

    # Per-difficulty breakdown
    lines.append("\n## Per-difficulty correctness\n")
    diff_order = ["factual", "conceptual", "multi_hop", "unknown"]
    seen_diffs = sorted(
        {d for sysmap in diffs.values() for d in sysmap.keys()},
        key=lambda d: diff_order.index(d) if d in diff_order else len(diff_order),
    )
    header = "| System | " + " | ".join(seen_diffs) + " |"
    sep = "|---|" + "|".join(["---"] * len(seen_diffs)) + "|"
    lines.append(header)
    lines.append(sep)
    for system in sorted(diffs.keys()):
        cells = []
        for diff in seen_diffs:
            entry = diffs[system].get(diff)
            if entry is None:
                cells.append("—")
            else:
                cells.append(_fmt_pair(entry["correctness_mean"]))
        lines.append(f"| {system} | " + " | ".join(cells) + " |")

    return "\n".join(lines)

"""LLM-as-judge scoring for the eval harness.

Three judges: correctness (0-3), groundedness (0-3), spoiler-respect (binary).
The spoiler judge runs a deterministic canary check first and only invokes the
LLM if canaries pass — that catches obvious leaks for free and reserves the
LLM judge for subtle paraphrased ones.

Rubric prompts are versioned markdown in prompts/. Bumping a rubric should
also bump JUDGE_VERSION so old runs stay comparable to themselves.
"""

import json
import re
from pathlib import Path

JUDGE_VERSION = "v1.1"

_HERE = Path(__file__).resolve().parent
_PROMPTS_DIR = _HERE / "prompts"
_PAGES_DIR = _HERE / "fixtures" / "paper_pages"


def _load_prompt(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text()


PROMPT_CORRECTNESS = _load_prompt("judge_correctness.md")
PROMPT_GROUNDEDNESS = _load_prompt("judge_groundedness.md")
PROMPT_SPOILER = _load_prompt("judge_spoiler.md")


def _load_paper_pages(paper_id: str) -> list[dict]:
    path = _PAGES_DIR / f"{paper_id}_pages.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())


def get_paper_content_up_to(paper_id: str, current_page: int, max_chars: int = 5000) -> str:
    pages = _load_paper_pages(paper_id)
    visible = [p["text"] for p in pages if p["page"] <= current_page]
    out = "\n\n".join(visible)
    if len(out) > max_chars:
        out = out[:max_chars] + "\n…[truncated]"
    return out


def get_paper_content_after(paper_id: str, current_page: int, max_chars: int = 5000) -> str:
    pages = _load_paper_pages(paper_id)
    later = [p["text"] for p in pages if p["page"] > current_page]
    out = "\n\n".join(later)
    if len(out) > max_chars:
        out = out[:max_chars] + "\n…[truncated]"
    return out


def get_full_paper_text(paper_id: str, max_chars: int | None = None) -> str:
    pages = _load_paper_pages(paper_id)
    out = "\n\n".join(p["text"] for p in pages)
    if max_chars is not None and len(out) > max_chars:
        out = out[:max_chars] + "\n…[truncated]"
    return out


def get_paper_metadata_static(paper_id: str) -> dict:
    """Cheap metadata for B0.5 — title, abstract, section names — from the page snapshots."""
    pages = _load_paper_pages(paper_id)
    if not pages:
        return {}
    # Heuristic: first page has title + author info; second page typically has Abstract
    title = ""
    abstract = ""
    if len(pages) >= 1:
        first_lines = [ln.strip() for ln in pages[0]["text"].splitlines() if ln.strip()]
        if first_lines:
            title = first_lines[0]
    # Pull abstract from the first occurrence
    full = "\n".join(p["text"] for p in pages[:3])
    m = re.search(r"Abstract\s*\n(.+?)(?:\n\d+\.\s|\nIntroduction|\n1\.\s)", full, re.DOTALL | re.IGNORECASE)
    if m:
        abstract = m.group(1).strip()[:2000]
    return {"title": title, "abstract": abstract}


def _parse_judge_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Common failure: model emits LaTeX-style backslash escapes (e.g. \Gamma)
        # which aren't valid JSON. Repair by escaping any backslash that isn't
        # already a valid JSON escape character.
        repaired = re.sub(r'\\(?!["\\/bfnrtu])', r'\\\\', text)
        return json.loads(repaired)


async def _llm_judge(client, model: str, prompt: str, max_tokens: int = 512) -> tuple[dict, dict]:
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in response.content if hasattr(b, "text"))
    try:
        parsed = _parse_judge_json(text)
    except json.JSONDecodeError as e:
        parsed = {"score": 0, "reasoning": f"JUDGE_PARSE_ERROR: {e}; raw={text[:300]}"}
    telemetry = {
        "input_tokens": getattr(response.usage, "input_tokens", 0),
        "output_tokens": getattr(response.usage, "output_tokens", 0),
        "model": model,
    }
    return parsed, telemetry


async def judge_correctness(
    answer: str,
    question: dict,
    client,
    model: str = "claude-sonnet-4-20250514",
) -> tuple[dict, dict]:
    keypoints_str = "\n".join(
        f"  {i}. {kp}" for i, kp in enumerate(question["gold_answer_keypoints"])
    )
    prompt = PROMPT_CORRECTNESS.format(
        question=question["question"],
        gold_answer=question["gold_answer"],
        keypoints=keypoints_str,
        answer=answer,
    )
    return await _llm_judge(client, model, prompt)


async def judge_groundedness(
    answer: str,
    question: dict,
    client,
    model: str = "claude-sonnet-4-20250514",
) -> tuple[dict, dict]:
    # Cap is generous on purpose: previous 4000-char limit truncated to the
    # abstract on multi-page contexts, so the judge couldn't verify legitimate
    # technical citations and flagged them as fabrications. 60K covers the full
    # papers in this corpus (~57K chars max) with headroom.
    paper_excerpt = get_paper_content_up_to(
        question["paper_id"], question["current_page_context"], max_chars=60000
    )
    prompt = PROMPT_GROUNDEDNESS.format(
        question=question["question"],
        paper_excerpt=paper_excerpt,
        answer=answer,
    )
    return await _llm_judge(client, model, prompt)


async def judge_spoiler(
    answer: str,
    question: dict,
    client,
    model: str = "claude-sonnet-4-20250514",
) -> tuple[dict, dict]:
    """Two-stage. Returns ({pass, method, leaked_content, reasoning}, telemetry)."""
    canaries = question.get("spoiler_canaries", [])
    answer_lower = answer.lower()
    canary_hits = [c for c in canaries if c.lower() in answer_lower]
    if canary_hits:
        return (
            {
                "pass": False,
                "method": "canary",
                "leaked_content": f"Canary terms detected: {canary_hits}",
                "reasoning": "Deterministic substring match on spoiler_canaries.",
            },
            {"input_tokens": 0, "output_tokens": 0, "model": "canary"},
        )

    later_content = get_paper_content_after(
        question["paper_id"], question["current_page_context"], max_chars=30000
    )
    if not later_content:
        return (
            {
                "pass": True,
                "method": "no_later_content",
                "leaked_content": "",
                "reasoning": "Question is at end of paper.",
            },
            {"input_tokens": 0, "output_tokens": 0, "model": "noop"},
        )

    visible_content = get_paper_content_up_to(
        question["paper_id"], question["current_page_context"], max_chars=30000
    )

    prompt = PROMPT_SPOILER.format(
        current_page_context=question["current_page_context"],
        visible_content=visible_content,
        later_content_summary=later_content,
        question=question["question"],
        answer=answer,
    )
    parsed, telemetry = await _llm_judge(client, model, prompt)
    parsed.setdefault("method", "llm")
    return parsed, telemetry

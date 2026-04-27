"""Runners for the eval harness — one per system being evaluated.

Six functions, all async, all returning (answer: str, telemetry: dict) with
identical telemetry shape:
    {
      "system": str,
      "model": str,
      "latency_seconds": float,
      "input_tokens": int,
      "output_tokens": int,
      "num_tool_calls": int,
      "tool_calls": list[str],            # ordered names
      "tool_families_called": list[str],  # de-duped families
      "cost_usd": float,
    }

All agent runners construct a fresh Agent per question (no conversation
carryover). Reading context is overlaid via an in-memory positions dict so
we don't touch production data.
"""

import sys
import time
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.parent
if str(_PROJECT_ROOT / "agent") not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT / "agent"))

from loop import Agent  # noqa: E402
from prompts import SYSTEM_PROMPT  # noqa: E402
from context import build_reading_context  # noqa: E402

from .judge import get_full_paper_text, get_paper_metadata_static  # noqa: E402

DEFAULT_MODEL = "claude-sonnet-4-20250514"

TOOL_FAMILIES = {
    "parse_paper": "retrieval",
    "get_section": "retrieval",
    "get_sections_up_to": "retrieval",
    "search_paper": "retrieval",
    "get_paper_metadata": "retrieval",
    "get_user_knowledge": "kg_read",
    "get_concept": "kg_read",
    "find_prerequisite_gaps": "kg_read",
    "get_learning_path": "kg_read",
    "get_related_concepts": "kg_read",
    "add_concept": "kg_write",
    "update_confidence": "kg_write",
    "remove_concept": "kg_write",
}

PAPER_PARSER_TOOLS = {
    "parse_paper", "get_section", "get_sections_up_to", "search_paper", "get_paper_metadata",
}
KG_TOOLS = {
    "get_user_knowledge", "get_concept", "find_prerequisite_gaps", "get_learning_path",
    "get_related_concepts", "add_concept", "update_confidence", "remove_concept",
}

# $ per million tokens
PRICING = {
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-6": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},
    "claude-opus-4-7": {"input": 15.0, "output": 75.0},
}


def estimate_cost(input_tokens: int, output_tokens: int, model: str) -> float:
    p = PRICING.get(model, {"input": 3.0, "output": 15.0})
    return (input_tokens * p["input"] + output_tokens * p["output"]) / 1_000_000


def _make_positions_dict() -> dict:
    return {
        "papers": {
            "0a49ef88": {
                "title": "One Diffusion to Generate Them All",
                "total_pages": 12,
                "current_page": 0,
                "max_page_read": 0,
            },
            "c29b4626": {
                "title": "A Complete Recipe for Diffusion Generative Models",
                "total_pages": 12,
                "current_page": 0,
                "max_page_read": 0,
            },
        }
    }


def _reading_context_for(question: dict) -> str:
    return build_reading_context(
        current_paper_id=question["paper_id"],
        current_page=question["current_page_context"],
        positions=_make_positions_dict(),
    )


def _summarize_agent_telemetry(agent: Agent, system_id: str, model: str, elapsed: float) -> dict:
    in_tok = sum(u["input_tokens"] for u in agent.usage_log)
    out_tok = sum(u["output_tokens"] for u in agent.usage_log)
    tool_names: list[str] = []
    for msg in agent.conversation_history:
        if msg["role"] == "assistant" and not isinstance(msg["content"], str):
            for block in msg["content"]:
                if hasattr(block, "type") and block.type == "tool_use":
                    tool_names.append(block.name)
    families = sorted({TOOL_FAMILIES.get(t, "unknown") for t in tool_names})
    return {
        "system": system_id,
        "model": model,
        "latency_seconds": elapsed,
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "num_tool_calls": len(tool_names),
        "tool_calls": tool_names,
        "tool_families_called": families,
        "cost_usd": estimate_cost(in_tok, out_tok, model),
    }


async def _one_shot_call(client, model: str, prompt: str, max_tokens: int = 2048):
    start = time.time()
    response = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    elapsed = time.time() - start
    answer = "".join(b.text for b in response.content if hasattr(b, "text"))
    in_tok = getattr(response.usage, "input_tokens", 0)
    out_tok = getattr(response.usage, "output_tokens", 0)
    return answer, in_tok, out_tok, elapsed


# ---- Runners ----

async def run_b0_5(question: dict, client, mcp, model: str = DEFAULT_MODEL):
    """Plain Claude + abstract + section names. The training-data null."""
    meta = get_paper_metadata_static(question["paper_id"])
    title = meta.get("title", question.get("paper_title", "Unknown"))
    abstract = meta.get("abstract", "")
    reading_ctx = _reading_context_for(question)
    prompt = (
        f"{reading_ctx}\n\n"
        f"You are answering a question about the paper \"{title}\". "
        f"You only have access to the title and abstract — not the full text.\n\n"
        f"Abstract:\n{abstract}\n\n"
        f"Question: {question['question']}\n\n"
        "Answer based only on the title, abstract, and your prior knowledge of this kind of paper."
    )
    answer, in_tok, out_tok, elapsed = await _one_shot_call(client, model, prompt)
    return answer, {
        "system": "B0.5", "model": model, "latency_seconds": elapsed,
        "input_tokens": in_tok, "output_tokens": out_tok,
        "num_tool_calls": 0, "tool_calls": [], "tool_families_called": [],
        "cost_usd": estimate_cost(in_tok, out_tok, model),
    }


async def run_b1(question: dict, client, mcp, model: str = DEFAULT_MODEL):
    """Plain Claude + full paper text. The brute-force upper bound."""
    if not question.get("b1_eligible", False):
        return "[B1 SKIPPED — paper exceeds eligible context window]", {
            "system": "B1", "model": model, "latency_seconds": 0.0,
            "input_tokens": 0, "output_tokens": 0,
            "num_tool_calls": 0, "tool_calls": [], "tool_families_called": [],
            "cost_usd": 0.0, "skipped": True,
        }
    full_text = get_full_paper_text(question["paper_id"], max_chars=400_000)
    reading_ctx = _reading_context_for(question)
    prompt = (
        f"{reading_ctx}\n\n"
        f"You are answering a question about the paper below. The full text is provided.\n\n"
        f"=== PAPER TEXT ===\n{full_text}\n=== END PAPER TEXT ===\n\n"
        f"Question: {question['question']}\n"
    )
    answer, in_tok, out_tok, elapsed = await _one_shot_call(client, model, prompt)
    return answer, {
        "system": "B1", "model": model, "latency_seconds": elapsed,
        "input_tokens": in_tok, "output_tokens": out_tok,
        "num_tool_calls": 0, "tool_calls": [], "tool_families_called": [],
        "cost_usd": estimate_cost(in_tok, out_tok, model),
    }


async def _run_agent(question, client, mcp, excluded_tools, system_id, model):
    reading_ctx = _reading_context_for(question)
    enriched = f"{reading_ctx}\n\n{question['question']}"
    agent = Agent(
        client, SYSTEM_PROMPT,
        mcp_client=mcp, excluded_tools=excluded_tools, temperature=0.0,
    )
    start = time.time()
    answer = await agent.chat_async(enriched)
    elapsed = time.time() - start
    return answer, _summarize_agent_telemetry(agent, system_id, model, elapsed)


async def run_a0(question, client, mcp, model: str = DEFAULT_MODEL):
    """Agent + system prompt, no MCP tools. Isolates system-prompt effect."""
    excluded = PAPER_PARSER_TOOLS | KG_TOOLS
    return await _run_agent(question, client, mcp, excluded, "A0", model)


async def run_a1(question, client, mcp, model: str = DEFAULT_MODEL):
    """Agent + paper_parser only. Retrieval-tool effect, isolated."""
    return await _run_agent(question, client, mcp, KG_TOOLS, "A1", model)


async def run_a2(question, client, mcp, model: str = DEFAULT_MODEL):
    """Agent + KG only. Groundedness null — any paper-content claim is a training leak."""
    return await _run_agent(question, client, mcp, PAPER_PARSER_TOOLS, "A2", model)


async def run_a3(question, client, mcp, model: str = DEFAULT_MODEL):
    """Agent + both MCPs. Production system."""
    return await _run_agent(question, client, mcp, set(), "A3", model)


RUNNERS = {
    "B0.5": run_b0_5,
    "B1": run_b1,
    "A0": run_a0,
    "A1": run_a1,
    "A2": run_a2,
    "A3": run_a3,
}

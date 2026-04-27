"""Reading-position storage and the [Reading Context] block builder.

The agent receives a [Reading Context] block prepended to each user
message. It tells the agent which paper is open, how far the user has
read, and what other papers exist — so it can ground answers in the
user's current view without spoiling later content.

Lifted out of backend/api.py so the eval harness can build the same
context from a frozen fixture file rather than mutating production data.
"""

import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
POSITIONS_DIR = PROJECT_ROOT / "data" / "reading_positions"


def _positions_path(user_id: str, positions_file: Path | None) -> Path:
    if positions_file is not None:
        return Path(positions_file)
    return POSITIONS_DIR / f"{user_id}.json"


def load_positions(
    user_id: str = "default",
    positions_file: Path | None = None,
) -> dict:
    p = _positions_path(user_id, positions_file)
    if not p.exists():
        return {"papers": {}}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {"papers": {}}


def save_positions(
    data: dict,
    user_id: str = "default",
    positions_file: Path | None = None,
) -> None:
    p = _positions_path(user_id, positions_file)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2))


def build_reading_context(
    current_paper_id: str | None,
    current_page: int,
    current_line: str = "",
    user_id: str = "default",
    positions_file: Path | None = None,
    positions: dict | None = None,
) -> str:
    """Build a [Reading Context] block to prepend to the user's chat message.

    Tells the agent which paper is currently open, exactly which line the
    user is looking at, how far they've read overall, and what other papers
    they've engaged with — so the agent knows what it can reference freely
    vs. what would be a spoiler.

    `positions` (in-memory dict) takes precedence over `positions_file` —
    eval harness uses this to override per-question without tempfiles.
    """
    if positions is None:
        positions = load_positions(user_id, positions_file)
    papers = positions.get("papers", {})

    current_info = papers.get(current_paper_id or "", {}) if current_paper_id else {}
    max_read = max(current_info.get("max_page_read", 0), current_page)

    lines = ["[Reading Context]"]

    if current_paper_id and current_info:
        title = current_info.get("title", "Unknown")
        total = current_info.get("total_pages", 0)
        lines.append(
            f'Currently reading: "{title}" (paper_id: {current_paper_id}) — '
            f"on page {current_page} of {total}, max page read: {max_read}."
        )
    elif current_paper_id:
        lines.append(
            f"Currently reading: paper_id {current_paper_id} — on page {current_page}."
        )
    else:
        lines.append("No paper is currently open.")

    if current_line:
        snippet = current_line if len(current_line) <= 300 else current_line[:300] + "…"
        lines.append(f'User is currently looking at this line: "{snippet}"')

    others = []
    for pid, info in papers.items():
        if pid == current_paper_id:
            continue
        title = info.get("title", "Unknown")
        max_r = info.get("max_page_read", 0)
        total = info.get("total_pages", 0)
        status = (
            "fully read"
            if max_r >= total and total > 0
            else f"read through page {max_r} of {total}"
        )
        others.append(f'  - "{title}" (paper_id: {pid}) — {status}')
    if others:
        lines.append("Other papers in the user's library:")
        lines.extend(others)

    lines.append("")
    lines.append(
        "Spoiler rules: For the currently-open paper, do NOT reveal or reference "
        f"content past page {max_read}. The 'current line' above tells you "
        "exactly where the user is within that page — use it to ground your "
        "answer in what they're looking at right now. For other papers in the "
        "library that the user has already read, you may reference their concepts "
        "freely — but never use them to spoil later parts of the current paper. "
        "When calling add_concept, include the paper title and current page in "
        "the source field."
    )
    lines.append("[/Reading Context]")
    return "\n".join(lines)

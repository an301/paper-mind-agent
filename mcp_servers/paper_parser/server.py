import json
from mcp.server.fastmcp import FastMCP
from parser import PaperStore

server = FastMCP("paper-parser")
store = PaperStore()


# ============================================================
# Tool 1: parse_paper
# ============================================================

@server.tool()
def parse_paper(pdf_path: str, paper_id: str = "default") -> str:
    """Parse a PDF research paper into sections.

    Must be called before using other paper tools.
    Returns the title, authors, and list of detected sections.

    Args:
        pdf_path: Path to the PDF file on disk
        paper_id: Optional identifier for the paper
    """
    try:
        result = store.add_paper(paper_id, pdf_path)
        return json.dumps(result, indent=2)
    except FileNotFoundError:
        return f"Error: File not found at '{pdf_path}'"
    except Exception as e:
        return f"Error parsing PDF: {e}"


# ============================================================
# Tool 2: get_section
# ============================================================

@server.tool()
def get_section(section_name: str, paper_id: str = "default") -> str:
    """Retrieve a specific section from the parsed paper.

    Automatically updates the reading position — the user has now
    "seen" this section and everything before it.

    Args:
        section_name: Name of the section (e.g. 'abstract', 'introduction')
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    section_name = section_name.lower().strip()

    if section_name in paper["sections"]:
        store.update_read_position(section_name, paper_id)
        return paper["sections"][section_name]

    available = ", ".join(paper["section_order"])
    return f"Section '{section_name}' not found. Available sections: {available}"


# ============================================================
# Tool 3: get_sections_up_to
# ============================================================

@server.tool()
def get_sections_up_to(section_name: str = "", paper_id: str = "default") -> str:
    """Retrieve all sections from the beginning up to and including
    the specified section. Use this to respect the user's reading
    position — only provide information from sections they've read.

    If no section_name is provided, returns all sections the user
    has read so far (based on automatic reading position tracking).

    Args:
        section_name: The last section to include (optional)
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    if not section_name:
        read_sections = store.get_read_sections(paper_id)
        if not read_sections:
            return "No sections have been read yet."
        return json.dumps(read_sections, indent=2)

    section_name = section_name.lower().strip()
    order = paper["section_order"]

    if section_name not in order:
        available = ", ".join(order)
        return f"Section '{section_name}' not found. Available sections: {available}"

    target_index = order.index(section_name)
    result = {}
    for i in range(target_index + 1):
        name = order[i]
        result[name] = paper["sections"][name]

    store.update_read_position(section_name, paper_id)
    return json.dumps(result, indent=2)


# ============================================================
# Tool 4: search_paper
# ============================================================

@server.tool()
def search_paper(query: str, paper_id: str = "default") -> str:
    """Search the paper for paragraphs containing the query text.
    Returns matching paragraphs with their section names.

    Currently keyword-based. Will be upgraded to semantic search
    with embeddings in a later phase.

    Args:
        query: Text to search for in the paper
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    query_lower = query.lower()
    results = []

    for section_name, content in paper["sections"].items():
        paragraphs = content.split("\n\n")
        for paragraph in paragraphs:
            if query_lower in paragraph.lower():
                results.append({
                    "section": section_name,
                    "text": paragraph.strip()[:500],
                })

    if not results:
        return f"No matches found for '{query}'."

    return json.dumps(results[:10], indent=2)


# ============================================================
# Tool 5: get_paper_metadata
# ============================================================

@server.tool()
def get_paper_metadata(paper_id: str = "default") -> str:
    """Get metadata about the parsed paper: title, authors, abstract,
    number of sections, section names, and reading progress.

    Does not return full section content — use get_section for that.

    Args:
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    read_pos = paper["read_position"]
    sections_read = read_pos + 1 if read_pos >= 0 else 0

    metadata = {
        "paper_id": paper_id or store.active_paper_id,
        "title": paper.get("title", ""),
        "authors": paper.get("authors", ""),
        "abstract": paper.get("abstract", ""),
        "num_sections": len(paper["sections"]),
        "sections": paper["section_order"],
        "sections_read": sections_read,
        "current_section": paper["section_order"][read_pos] if read_pos >= 0 else None,
        "total_characters": len(paper["full_text"]),
    }

    return json.dumps(metadata, indent=2)


if __name__ == "__main__":
    server.run()

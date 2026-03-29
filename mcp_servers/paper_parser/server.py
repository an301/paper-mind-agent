import json
from mcp.server.fastmcp import FastMCP
from parser import PaperStore

# Create the MCP server with a name that identifies it
server = FastMCP("paper-parser")

# Create the paper store — shared across all tool calls
store = PaperStore()


# ============================================================
# Tool 1: parse_paper
# ============================================================
# This must be called first. It loads a PDF, splits it into
# sections, and stores it so other tools can access it.

@server.tool()
def parse_paper(pdf_path: str, paper_id: str = "default") -> str:
    """Parse a PDF research paper into sections.

    Must be called before using other paper tools.
    Returns the list of detected sections.

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
# Retrieves a single section by name.

@server.tool()
def get_section(section_name: str, paper_id: str = "default") -> str:
    """Retrieve a specific section from the parsed paper.

    Args:
        section_name: Name of the section (e.g. 'abstract', 'introduction')
        paper_id: Optional paper identifier (defaults to most recent paper)
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    section_name = section_name.lower().strip()

    if section_name in paper["sections"]:
        # Automatically update reading position — the user has now
        # "seen" this section and everything before it
        store.update_read_position(section_name, paper_id)
        return paper["sections"][section_name]

    available = ", ".join(paper["section_order"])
    return f"Section '{section_name}' not found. Available sections: {available}"


# ============================================================
# Tool 3: get_sections_up_to
# ============================================================
# The "no spoilers" tool. Returns everything the user has
# read so far, but nothing after their current position.

@server.tool()
def get_sections_up_to(section_name: str = "", paper_id: str = "default") -> str:
    """Retrieve all sections from the beginning up to and including
    the specified section. Use this to respect the user's reading
    position — only provide information from sections they've read.

    If no section_name is provided, returns all sections the user
    has read so far (based on automatic reading position tracking).

    Args:
        section_name: The last section to include (optional — defaults to current reading position)
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    # If no section specified, use the automatically tracked position
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

    # Find the index of the target section, then return everything
    # from the start up to and including that section.
    target_index = order.index(section_name)
    result = {}
    for i in range(target_index + 1):
        name = order[i]
        result[name] = paper["sections"][name]

    # Also update the reading position
    store.update_read_position(section_name, paper_id)

    return json.dumps(result, indent=2)


# ============================================================
# Tool 4: search_paper
# ============================================================
# Simple keyword search within the paper. In Phase 5, this gets
# replaced with semantic search using embeddings + FAISS.

@server.tool()
def search_paper(query: str, paper_id: str = "default") -> str:
    """Search the paper for paragraphs containing the query text.
    Returns matching paragraphs with their section names.

    This is a simple keyword search. Will be upgraded to semantic
    search with embeddings in Phase 5.

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
        # Split section into paragraphs and check each one
        paragraphs = content.split("\n\n")
        for paragraph in paragraphs:
            if query_lower in paragraph.lower():
                results.append({
                    "section": section_name,
                    "text": paragraph.strip(),
                })

    if not results:
        return f"No matches found for '{query}'."

    return json.dumps(results, indent=2)


# ============================================================
# Tool 5: get_paper_metadata
# ============================================================
# Returns high-level info about the paper without spoiling content.

@server.tool()
def get_paper_metadata(paper_id: str = "default") -> str:
    """Get metadata about the parsed paper: number of sections,
    section names, and total length. Does not return actual content.

    Args:
        paper_id: Optional paper identifier
    """
    paper = store.get_paper(paper_id)
    if not paper:
        return "Error: No paper loaded. Call parse_paper first."

    metadata = {
        "paper_id": paper_id or store.active_paper_id,
        "num_sections": len(paper["sections"]),
        "sections": paper["section_order"],
        "total_characters": len(paper["full_text"]),
    }

    return json.dumps(metadata, indent=2)


# Start the server. This makes it listen on stdin/stdout
# for incoming tool calls from the agent.
if __name__ == "__main__":
    server.run()

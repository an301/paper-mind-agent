import re
import pymupdf


def extract_text_from_pdf(pdf_path):
    """Extract all text from a PDF file, page by page.

    PyMuPDF reads each page and extracts the text content.
    We return a single string with all pages combined.
    """
    doc = pymupdf.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()
    return full_text


def split_into_sections(full_text):
    """Split paper text into sections based on headings.

    Research papers typically have numbered sections like:
      1. Introduction
      2. Related Work
      3. Methodology

    Or unnumbered headings like:
      Abstract
      Introduction
      Conclusion

    This function detects those patterns and splits the text.
    Returns a dict mapping section names to their content.
    """
    # This regex matches common section heading patterns:
    # - "1. Introduction" or "2.1 Methods" (numbered)
    # - "Abstract" or "INTRODUCTION" (standalone uppercase/title words)
    # - "References" at the end
    #
    # re.MULTILINE makes ^ match the start of each line, not just
    # the start of the entire string.
    section_pattern = re.compile(
        r"^(\d+\.?\d*\.?\s+[A-Z][^\n]+|Abstract|ABSTRACT|Introduction|INTRODUCTION|"
        r"Conclusion|CONCLUSION|References|REFERENCES|Related Work|RELATED WORK|"
        r"Methodology|METHODOLOGY|Methods|METHODS|Results|RESULTS|Discussion|DISCUSSION)",
        re.MULTILINE,
    )

    # Find all heading positions in the text
    matches = list(section_pattern.finditer(full_text))

    if not matches:
        # No sections found — return the whole text as one section
        return {"full_text": full_text.strip()}

    sections = {}
    for i, match in enumerate(matches):
        # The section name is what the regex matched
        section_name = match.group().strip()
        # Clean up: remove numbering like "1. " for cleaner keys
        clean_name = re.sub(r"^\d+\.?\d*\.?\s+", "", section_name).lower()

        # The section content starts after the heading and goes
        # until the next heading (or end of text for the last section)
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)

        content = full_text[start:end].strip()
        if content:
            sections[clean_name] = content

    return sections


class PaperStore:
    """Stores parsed papers so tools can access them.

    This is a simple in-memory store. When the user calls parse_paper,
    we parse the PDF and store the sections here. Other tools then
    read from this store.

    In a production system, you'd use a database. For Phase 2,
    in-memory is fine — we're learning the architecture.
    """

    def __init__(self):
        # Maps paper_id to its data (sections, metadata, etc.)
        self.papers = {}
        # Tracks which paper is currently active (most recently parsed)
        self.active_paper_id = None

    def add_paper(self, paper_id, pdf_path):
        """Parse a PDF and store its sections."""
        full_text = extract_text_from_pdf(pdf_path)
        sections = split_into_sections(full_text)

        self.papers[paper_id] = {
            "pdf_path": pdf_path,
            "full_text": full_text,
            "sections": sections,
            # Store section names in order for get_sections_up_to
            "section_order": list(sections.keys()),
            # Track the furthest section the user has read.
            # Updated automatically every time get_section is called.
            # -1 means no sections have been read yet.
            "read_position": -1,
        }
        self.active_paper_id = paper_id

        return {
            "paper_id": paper_id,
            "num_sections": len(sections),
            "section_names": list(sections.keys()),
        }

    def get_paper(self, paper_id=None):
        """Get a parsed paper's data. Uses active paper if no ID given."""
        paper_id = paper_id or self.active_paper_id
        if not paper_id or paper_id not in self.papers:
            return None
        return self.papers[paper_id]

    def update_read_position(self, section_name, paper_id=None):
        """Update the reading position when a section is accessed.

        Only moves forward — if the user reads section 3 then section 1,
        the position stays at 3. You can't "unread" a section.
        """
        paper = self.get_paper(paper_id)
        if not paper or section_name not in paper["section_order"]:
            return

        section_index = paper["section_order"].index(section_name)
        # Only advance, never go backwards
        if section_index > paper["read_position"]:
            paper["read_position"] = section_index

    def get_read_sections(self, paper_id=None):
        """Return all sections up to the current reading position."""
        paper = self.get_paper(paper_id)
        if not paper or paper["read_position"] < 0:
            return {}

        result = {}
        for i in range(paper["read_position"] + 1):
            name = paper["section_order"][i]
            result[name] = paper["sections"][name]
        return result

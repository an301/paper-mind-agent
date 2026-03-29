import re
import pymupdf


def extract_text_from_pdf(pdf_path):
    """Extract all text from a PDF file, page by page."""
    doc = pymupdf.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()
    return full_text


def extract_metadata_from_pdf(pdf_path):
    """Extract title, authors, and abstract from a PDF.

    Heuristic approach:
    - Title: largest font text on page 1, or first non-empty line
    - Authors: lines between title and abstract (often smaller font, with commas)
    - Abstract: text following an "Abstract" heading
    """
    doc = pymupdf.open(pdf_path)
    page = doc[0]

    # Get text blocks with font info from the first page
    blocks = page.get_text("dict")["blocks"]

    title = ""
    authors = ""
    max_font_size = 0
    title_bottom = 0

    # Find the largest font text on page 1 — that's usually the title
    for block in blocks:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()
                size = span["size"]
                if text and size > max_font_size and len(text) > 5:
                    max_font_size = size
                    title = text
                    title_bottom = line["bbox"][3]

    # Collect lines after the title for author extraction
    # Authors are usually between the title and abstract, in a mid-size font
    author_lines = []
    abstract_started = False
    for block in blocks:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            y_pos = line["bbox"][1]
            if y_pos <= title_bottom:
                continue
            line_text = " ".join(span["text"] for span in line["spans"]).strip()
            if not line_text:
                continue
            if re.match(r"^(abstract|ABSTRACT)", line_text, re.IGNORECASE):
                abstract_started = True
                break
            # Stop collecting authors if we hit a section-like heading or long text
            if len(line_text) > 200:
                break
            author_lines.append(line_text)

    if author_lines:
        authors = " ".join(author_lines[:5])  # Cap at 5 lines

    # Also check PDF metadata
    pdf_meta = doc.metadata
    if not title and pdf_meta.get("title"):
        title = pdf_meta["title"]
    if not authors and pdf_meta.get("author"):
        authors = pdf_meta["author"]

    doc.close()
    return {"title": title, "authors": authors}


def split_into_sections(full_text):
    """Split paper text into sections based on headings.

    Handles common academic paper formats:
    - Numbered: "1. Introduction", "2.1 Methods", "3 Results"
    - Unnumbered: "Abstract", "INTRODUCTION", "Related Work"
    - Roman numerals: "I. Introduction", "II. Methods"
    """
    section_pattern = re.compile(
        r"^("
        # Numbered sections: "1. Introduction", "2.1 Methods", "3 Results"
        r"\d+\.?\d*\.?\s+[A-Z][^\n]{2,80}"
        r"|"
        # Roman numeral sections: "I. Introduction", "IV. EXPERIMENTS"
        r"[IVX]+\.\s+[A-Z][^\n]{2,80}"
        r"|"
        # Common standalone headings (case-insensitive matching)
        r"(?:Abstract|ABSTRACT"
        r"|Introduction|INTRODUCTION"
        r"|Related\s+Work|RELATED\s+WORK"
        r"|Background|BACKGROUND"
        r"|Methodology|METHODOLOGY|Methods|METHODS|Method|METHOD"
        r"|Approach|APPROACH"
        r"|Experiments?|EXPERIMENTS?"
        r"|Results?|RESULTS?"
        r"|Discussion|DISCUSSION"
        r"|Analysis|ANALYSIS"
        r"|Evaluation|EVALUATION"
        r"|Implementation|IMPLEMENTATION"
        r"|Conclusion|CONCLUSION|Conclusions|CONCLUSIONS"
        r"|Future\s+Work|FUTURE\s+WORK"
        r"|Acknowledgment|ACKNOWLEDGMENT|Acknowledgements?|ACKNOWLEDGEMENTS?"
        r"|References|REFERENCES|Bibliography|BIBLIOGRAPHY"
        r"|Appendix|APPENDIX)"
        r")",
        re.MULTILINE,
    )

    matches = list(section_pattern.finditer(full_text))

    if not matches:
        return {"full_text": full_text.strip()}

    sections = {}
    for i, match in enumerate(matches):
        section_name = match.group().strip()
        # Clean: remove numbering for cleaner keys
        clean_name = re.sub(r"^(\d+\.?\d*\.?\s+|[IVX]+\.\s+)", "", section_name).strip().lower()

        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)

        content = full_text[start:end].strip()
        if content:
            sections[clean_name] = content

    return sections


class PaperStore:
    """Stores parsed papers so tools can access them.

    In-memory store: parse_paper populates it, other tools read from it.
    """

    def __init__(self):
        self.papers = {}
        self.active_paper_id = None

    def add_paper(self, paper_id, pdf_path):
        """Parse a PDF and store its sections."""
        full_text = extract_text_from_pdf(pdf_path)
        sections = split_into_sections(full_text)
        metadata = extract_metadata_from_pdf(pdf_path)

        # Extract abstract from sections if present
        abstract = ""
        for key in ("abstract",):
            if key in sections:
                abstract = sections[key][:500]
                break

        self.papers[paper_id] = {
            "pdf_path": pdf_path,
            "full_text": full_text,
            "sections": sections,
            "section_order": list(sections.keys()),
            "read_position": -1,
            "title": metadata["title"],
            "authors": metadata["authors"],
            "abstract": abstract,
        }
        self.active_paper_id = paper_id

        return {
            "paper_id": paper_id,
            "title": metadata["title"],
            "authors": metadata["authors"],
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
        """Update reading position. Only moves forward."""
        paper = self.get_paper(paper_id)
        if not paper or section_name not in paper["section_order"]:
            return

        section_index = paper["section_order"].index(section_name)
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

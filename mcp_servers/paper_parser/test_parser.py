"""Quick test script to verify the parser works on a PDF."""
import sys
import json
from parser import PaperStore

if len(sys.argv) < 2:
    print("Usage: python test_parser.py <path_to_pdf>")
    print("Example: python test_parser.py ../../data/attention.pdf")
    sys.exit(1)

pdf_path = sys.argv[1]
store = PaperStore()

print(f"Parsing: {pdf_path}\n")
result = store.add_paper("test", pdf_path)

print(f"Found {result['num_sections']} sections:")
for i, name in enumerate(result['section_names']):
    section_text = store.papers["test"]["sections"][name]
    preview = section_text[:100].replace("\n", " ")
    print(f"  {i+1}. {name} ({len(section_text)} chars) — {preview}...")

print(f"\n--- Testing get_section ---")
first_section = result['section_names'][0]
content = store.papers["test"]["sections"][first_section]
print(f"Section '{first_section}': {content[:200]}...")

print(f"\n--- Testing read position tracking ---")
store.update_read_position(first_section, "test")
read = store.get_read_sections("test")
print(f"After reading '{first_section}', read sections: {list(read.keys())}")

print("\nParser test passed!")

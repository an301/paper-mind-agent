"""Smoke test for the Knowledge Graph."""
import os
from graph import KnowledgeGraph

TEST_USER = "test_user"

graph = KnowledgeGraph(TEST_USER)
print("=== Knowledge Graph Smoke Test ===\n")

# 1. Add concepts with prerequisite relationships
print("1. Adding concepts...")
graph.add_concept("matrix_multiplication", confidence=0.8, prerequisites=[], source="Linear Algebra")
graph.add_concept("exponential_function", confidence=0.9, prerequisites=[], source="Calculus")
graph.add_concept("normalization", confidence=0.7, prerequisites=[], source="Statistics")
graph.add_concept("dot_product", confidence=0.8, prerequisites=["matrix_multiplication"], source="Linear Algebra")
graph.add_concept("softmax", confidence=0.6, prerequisites=["exponential_function", "normalization"], source="Deep Learning Basics")
graph.add_concept("linear_projection", confidence=0.2, prerequisites=["matrix_multiplication"], source="Linear Algebra")
graph.add_concept("self_attention", confidence=0.3, prerequisites=["softmax", "dot_product", "linear_projection"], source="Attention Is All You Need, Section 3.2")
graph.add_concept("multi_head_attention", confidence=0.0, prerequisites=["self_attention", "linear_projection"], source="Attention Is All You Need, Section 3.2")
print(f"   Added {len(graph.concepts)} concepts.\n")

# 2. Get single concept
print("2. Getting single concept...")
concept = graph.get_concept("self_attention")
print(f"   self_attention: confidence={concept['confidence']}, prereqs={concept['prerequisites']}\n")

# 3. Find prerequisite gaps for multi_head_attention
print("3. Prerequisite gaps for 'multi_head_attention':")
gaps = graph.find_prerequisite_gaps("multi_head_attention")
for gap in gaps:
    print(f"   {gap['status'].upper():7s} | depth={gap['depth']} | {gap['concept']} (confidence={gap['confidence']})")
print()

# 4. Learning path
print("4. Learning path to 'multi_head_attention':")
path = graph.get_learning_path("multi_head_attention")
for step in path:
    marker = "OK" if step["known"] else "  "
    print(f"   [{marker}] {step['concept']} (confidence={step['confidence']})")
print()

# 5. Related concepts
print("5. Related concepts for 'softmax':")
related = graph.get_related_concepts("softmax")
print(f"   Prerequisites: {related['prerequisites']}")
print(f"   Dependents:    {related['dependents']}\n")

# 6. Update confidence
print("6. Updating 'self_attention' confidence 0.3 -> 0.7...")
graph.update_confidence("self_attention", 0.7)
print(f"   New confidence: {graph.get_concept('self_attention')['confidence']}\n")

# 7. Remove concept
print("7. Removing 'linear_projection'...")
graph.remove_concept("linear_projection")
mha = graph.get_concept("multi_head_attention")
print(f"   multi_head_attention prereqs: {mha['prerequisites']}")
assert "linear_projection" not in mha["prerequisites"], "Should be removed from prereqs"
print("   Correctly removed from prerequisite lists.\n")

# 8. Persistence
print("8. Testing persistence...")
graph2 = KnowledgeGraph(TEST_USER)
assert len(graph2.concepts) == len(graph.concepts), "Concept count mismatch after reload"
print(f"   Reloaded: {len(graph2.concepts)} concepts. Persistence works.\n")

# Cleanup
os.remove(graph._file_path)
print("=== All tests passed! ===")

import json
from mcp.server.fastmcp import FastMCP
from graph import KnowledgeGraph

server = FastMCP("knowledge-graph")

# Cache graph instances per user to avoid re-reading JSON on every call
_graphs = {}


def _get_graph(user_id: str = "default") -> KnowledgeGraph:
    if user_id not in _graphs:
        _graphs[user_id] = KnowledgeGraph(user_id)
    return _graphs[user_id]


# ============================================================
# Read tools
# ============================================================

@server.tool()
def get_user_knowledge(user_id: str = "default") -> str:
    """Get all concepts the user knows with their confidence scores.
    Use this at the start of a conversation to understand the user's
    current knowledge state.

    Args:
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    concepts = graph.concepts
    if not concepts:
        return "No concepts recorded yet. This user's knowledge graph is empty."
    return json.dumps(concepts, indent=2)


@server.tool()
def get_concept(concept_name: str, user_id: str = "default") -> str:
    """Get details about a single concept: confidence, prerequisites, and source.

    Args:
        concept_name: The concept to look up
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    data = graph.get_concept(concept_name)
    if not data:
        return f"Concept '{concept_name}' not found in knowledge graph."
    result = {"concept": concept_name.lower().strip(), **data}
    return json.dumps(result, indent=2)


# ============================================================
# Query tools
# ============================================================

@server.tool()
def find_prerequisite_gaps(concept_name: str, user_id: str = "default") -> str:
    """Find prerequisite concepts the user is missing or weak on.

    Given a target concept, walks its prerequisite chain via BFS and
    returns any gaps. Results are ordered most-foundational-first
    (learn these first).

    Args:
        concept_name: The concept to check prerequisites for
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    gaps = graph.find_prerequisite_gaps(concept_name)
    if not gaps:
        return f"No prerequisite gaps found for '{concept_name}'. User is ready."
    return json.dumps(gaps, indent=2)


@server.tool()
def get_learning_path(target_concept: str, user_id: str = "default") -> str:
    """Get an ordered list of concepts to learn to understand the target.

    Returns concepts in learning order: most foundational first,
    target concept last. Each entry shows whether the user already
    knows it.

    Args:
        target_concept: The concept the user wants to understand
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    path = graph.get_learning_path(target_concept)
    if not path:
        return f"Concept '{target_concept}' not found in knowledge graph."
    return json.dumps(path, indent=2)


@server.tool()
def get_related_concepts(concept_name: str, user_id: str = "default") -> str:
    """Get concepts related to a given concept: its prerequisites
    and the concepts that depend on it.

    Args:
        concept_name: The concept to find relationships for
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    result = graph.get_related_concepts(concept_name)
    return json.dumps(result, indent=2)


# ============================================================
# Write tools
# ============================================================

@server.tool()
def add_concept(
    concept_name: str,
    confidence: float = 0.5,
    prerequisites: list[str] | None = None,
    source: str = "",
    user_id: str = "default",
) -> str:
    """Record that the user has been exposed to a concept.

    Call this after explaining a concept to track it in the knowledge graph.

    Args:
        concept_name: Name of the concept (e.g. 'self_attention', 'softmax')
        confidence: How well the user understands it (0.0 to 1.0)
        prerequisites: Other concepts this one depends on
        source: Where they learned it (e.g. 'Attention Is All You Need, Section 3.2')
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    result = graph.add_concept(concept_name, confidence, prerequisites, source)
    return json.dumps({"concept": concept_name.lower().strip(), **result}, indent=2)


@server.tool()
def update_confidence(
    concept_name: str,
    new_confidence: float,
    user_id: str = "default",
) -> str:
    """Update how well the user understands a concept.

    Increase confidence when the user demonstrates understanding.
    Decrease it when they seem confused or make mistakes.

    Args:
        concept_name: The concept to update
        new_confidence: New confidence score (0.0 to 1.0)
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    result = graph.update_confidence(concept_name, new_confidence)
    if result is None:
        return f"Concept '{concept_name}' not found. Add it first with add_concept."
    return json.dumps({"concept": concept_name.lower().strip(), **result}, indent=2)


@server.tool()
def remove_concept(concept_name: str, user_id: str = "default") -> str:
    """Remove a concept from the knowledge graph.

    Use this to correct mistakes or when the user says they don't
    actually know something. Also cleans up references to this
    concept in other concepts' prerequisite lists.

    Args:
        concept_name: The concept to remove
        user_id: User identifier
    """
    graph = _get_graph(user_id)
    removed = graph.remove_concept(concept_name)
    if not removed:
        return f"Concept '{concept_name}' not found in knowledge graph."
    return f"Removed '{concept_name}' from knowledge graph."


if __name__ == "__main__":
    server.run()

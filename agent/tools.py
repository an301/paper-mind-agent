# Tool definitions and implementations for Phase 1.
#
# Each tool has TWO parts:
# 1. A DEFINITION — a dictionary describing the tool for Claude.
#    Claude reads this to understand what tools it can use.
# 2. An IMPLEMENTATION — the actual Python function that runs
#    when Claude decides to use the tool.


# ============================================================
# Tool Definitions (what Claude sees)
# ============================================================
# These follow the Anthropic API's tool format. Each definition has:
# - name: identifier Claude uses to call the tool
# - description: explains what the tool does (Claude reads this
#   to decide WHEN to use the tool, so it needs to be clear)
# - input_schema: a JSON Schema describing what inputs the tool
#   accepts. Claude uses this to know what arguments to provide.

TOOLS = [
    {
        "name": "get_section",
        "description": (
            "Retrieve a specific section from the current research paper. "
            "Use this to read parts of the paper the user is asking about. "
            "Available sections: abstract, introduction, methodology, results."
        ),
        "input_schema": {
            # JSON Schema format — a standard way to describe
            # the shape of data. The API requires this format.
            "type": "object",
            "properties": {
                "section_name": {
                    "type": "string",
                    "description": "The name of the section to retrieve (e.g. 'abstract', 'introduction').",
                }
            },
            # "required" means Claude MUST provide this field.
            # Without it, the tool call would be incomplete.
            "required": ["section_name"],
        },
    },
    {
        "name": "get_concept_confidence",
        "description": (
            "Check how well the user understands a specific concept. "
            "Returns a confidence score from 0.0 (no understanding) "
            "to 1.0 (strong understanding). Use this to decide how "
            "much detail to include when explaining something."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "concept_name": {
                    "type": "string",
                    "description": "The concept to check understanding of (e.g. 'attention mechanism', 'backpropagation').",
                }
            },
            "required": ["concept_name"],
        },
    },
]


# ============================================================
# Tool Implementations (what actually runs)
# ============================================================
# These are plain Python functions. When Claude says "I want to
# call get_section with section_name='abstract'", YOUR code
# calls these functions and sends the result back to Claude.

# Hardcoded paper sections — fake data for Phase 1.
# In Phase 2, this will be replaced by the Paper Parser MCP server
# that actually extracts sections from real PDFs.
PAPER_SECTIONS = {
    "abstract": (
        "We introduce the Transformer, a model architecture based entirely "
        "on attention mechanisms, dispensing with recurrence and convolutions "
        "entirely. Experiments on machine translation tasks show these models "
        "achieve state-of-the-art results while being more parallelizable "
        "and requiring significantly less time to train."
    ),
    "introduction": (
        "Recurrent neural networks, particularly LSTM and GRU, have been "
        "the dominant approach for sequence modeling. These models process "
        "sequences step by step, which prevents parallelization and becomes "
        "a bottleneck for longer sequences. Attention mechanisms have become "
        "an integral part of sequence modeling, but are typically used in "
        "conjunction with recurrent networks. We propose a new architecture "
        "that relies entirely on attention to draw global dependencies "
        "between input and output."
    ),
    "methodology": (
        "The Transformer uses multi-head self-attention to let each position "
        "attend to all positions in the previous layer. An attention function "
        "maps a query and a set of key-value pairs to an output, computed as "
        "a weighted sum of the values. We use scaled dot-product attention: "
        "Attention(Q,K,V) = softmax(QK^T / sqrt(d_k))V. Multi-head attention "
        "runs h parallel attention heads, allowing the model to jointly attend "
        "to information from different representation subspaces."
    ),
    "results": (
        "On the WMT 2014 English-to-German translation task, the big "
        "Transformer model outperforms the best previously reported models "
        "including ensembles by more than 2.0 BLEU. On English-to-French, "
        "our model achieves a new single-model state-of-the-art BLEU score "
        "of 41.0, surpassing all previously published single models, at less "
        "than 1/4 the training cost of the previous state-of-the-art model."
    ),
}

# Hardcoded concept confidence scores — fake user knowledge for Phase 1.
# In Phase 3, this will be replaced by the Knowledge Graph MCP server
# that tracks real user understanding over time.
CONCEPT_CONFIDENCE = {
    "neural networks": 0.7,
    "backpropagation": 0.5,
    "attention mechanism": 0.2,
    "transformer": 0.1,
    "self-attention": 0.1,
    "recurrent neural networks": 0.4,
    "lstm": 0.3,
    "softmax": 0.6,
    "matrix multiplication": 0.8,
}


def get_section(section_name):
    """Look up a paper section by name. Returns the text or an error."""
    section_name = section_name.lower().strip()
    if section_name in PAPER_SECTIONS:
        return PAPER_SECTIONS[section_name]
    return f"Section '{section_name}' not found. Available: {', '.join(PAPER_SECTIONS.keys())}"


def get_concept_confidence(concept_name):
    """Look up how well the user understands a concept. Returns a score."""
    concept_name = concept_name.lower().strip()
    if concept_name in CONCEPT_CONFIDENCE:
        score = CONCEPT_CONFIDENCE[concept_name]
        return f"User confidence in '{concept_name}': {score} (0.0=none, 1.0=strong)"
    return f"No data on '{concept_name}'. Assume beginner level (0.0)."


# A mapping from tool name to function, so the agent loop can
# look up which function to call when Claude requests a tool.
# This avoids writing if/elif chains — just look up by name.
TOOL_FUNCTIONS = {
    "get_section": get_section,
    "get_concept_confidence": get_concept_confidence,
}

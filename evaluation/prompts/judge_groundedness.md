# Groundedness Judge — v1.0

You are an expert evaluator. Score how well a system's answer is **grounded in the actual paper content** versus relying on hallucinated, fabricated, or non-paper-specific knowledge.

This is independent of correctness — an answer can be correct but ungrounded (right answer but invented terminology, no specific references) or incorrect but grounded (made specific paper-style claims that turn out to be wrong).

## Inputs

**Question:**
{question}

**Relevant paper content (for grounding reference):**
{paper_excerpt}

**System's answer to evaluate:**
{answer}

## Scoring rubric (0-3, integer only)

- **3 — Strongly grounded.** Answer references specific paper content: section names, equations, table numbers, named methods, exact numerical results, or distinctive paper-specific terminology. Information clearly traceable to the paper.
- **2 — Mostly grounded.** Answer uses paper-specific terminology and content but lacks precise references (no specific table/equation/section numbers). Most claims would be verifiable from the paper.
- **1 — Weakly grounded.** Answer is mostly generic — could apply to any paper on the same topic. Few or no paper-specific terms or results.
- **0 — Ungrounded or hallucinated.** Answer contains fabricated specifics (made-up numbers, table references that don't exist, invented method names), or reads as pure training-data recall with no use of the paper.

If the answer says "I don't have access to the paper" or refuses to answer, score 0.

## Output

Respond with ONLY valid JSON in this exact format. No markdown, no preamble, no commentary outside the JSON. **Do not use LaTeX escapes** (e.g. `\Gamma`, `\nu`) — use plain text or Unicode (Γ, ν), since LaTeX escapes break JSON parsing:

```
{{
  "score": <0|1|2|3>,
  "specific_references": [<list of distinctive paper-content phrases the answer cites, e.g. "Table 2", "Theorem 2.1", "AbsRel 6.8">],
  "fabrications": "<one-sentence description of any fabricated specifics, or empty string>",
  "reasoning": "<one or two sentences explaining the score>"
}}
```

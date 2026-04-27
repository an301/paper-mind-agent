# Correctness Judge — v1.0

You are an expert evaluator scoring a system's answer to a question about a research paper. Score how well the answer covers the **gold answer keypoints**.

## Inputs

**Question:**
{question}

**Gold answer (reference):**
{gold_answer}

**Gold answer keypoints (the enumerable claims the answer should cover):**
{keypoints}

**System's answer to evaluate:**
{answer}

## Scoring rubric (0-3, integer only)

- **3 — Fully correct.** All gold keypoints are clearly covered. No major factual errors.
- **2 — Mostly correct.** Most keypoints (≥⅔) covered. Minor omissions or imprecisions, no hallucinations of contradictory facts.
- **1 — Partially correct.** Some keypoints covered (≥⅓ but <⅔), OR all covered but with significant factual errors that would mislead the reader.
- **0 — Wrong or missing.** Fewer than ⅓ of keypoints covered, the answer is off-topic, or it contradicts the gold answer on substantive claims.

A keypoint is "covered" if the system's answer makes an equivalent claim — exact wording is not required, but the substantive content must match. Hedged or non-committal language ("possibly", "I think") that fails to commit to a correct claim does NOT count as covering the keypoint.

## Output

Respond with ONLY valid JSON in this exact format. No markdown, no preamble, no commentary outside the JSON. **Do not use LaTeX escapes** (e.g. `\Gamma`, `\nu`) — use plain text or Unicode (Γ, ν), since LaTeX escapes break JSON parsing:

```
{{
  "score": <0|1|2|3>,
  "covered_keypoints": [<list of indices into the keypoints array, 0-indexed, that the answer covers>],
  "errors": "<one-sentence description of any factual errors, or empty string>",
  "reasoning": "<one or two sentences explaining the score>"
}}
```

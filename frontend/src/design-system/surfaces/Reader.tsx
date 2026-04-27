import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Play,
  Pin,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "../util";
import { Badge, Button, Input, Kbd, Popover } from "../primitives";

/* ────────────────────────────────────────────────────────────────────
   Reader view.
   Two panes. Left: paper content at 68ch, 16/1.6. Right: agent panel —
   precision instrument with collapsible ReAct trace. Inline gap pattern:
   dotted-underline concept → click → pinned explanation pushes text down.
   ──────────────────────────────────────────────────────────────────── */

type Confidence = "solid" | "shaky" | "gap";

const PAPER = {
  title: "One Diffusion to Generate Them All",
  authors: ["Duong Le", "Tuan Pham", "Aniruddha Kembhavi", "Stephan Mandt", "Wei-Chiu Ma", "Jiasen Lu"],
  venue: "arXiv · 2024",
  pageCurrent: 5,
  pageMax: 8,
  pageTotal: 14,
};

const PARAGRAPHS: Array<
  | { kind: "h2"; text: string }
  | { kind: "p"; segments: Array<
      | { t: "text"; value: string }
      | { t: "gap"; term: string; confidence: Confidence; explanation: string }
    > }
> = [
  {
    kind: "h2",
    text: "3.2 · One-Gen training procedure",
  },
  {
    kind: "p",
    segments: [
      { t: "text", value: "OneDiffusion is trained on a unified corpus we call " },
      { t: "gap", term: "One-Gen", confidence: "shaky",
        explanation:
          "One-Gen is the paper's merged training dataset — ~11M image-text pairs plus six auxiliary view types (depth, segmentation, pose, HED, canny, multi-view). Each example is serialized as a sequence of 'views' so a single objective can cover image generation, understanding, and cross-view translation.",
      },
      { t: "text", value: ", a merged corpus that treats every task as a sequence of structured views. The model is trained with a single " },
      { t: "gap", term: "flow matching", confidence: "gap",
        explanation:
          "Flow matching trains a model to predict a vector field that transports a base distribution (noise) to the data distribution along straight-line probability paths. It generalizes diffusion — DDPM is a special case with a particular choice of noise schedule. Compared to denoising score matching, it converges faster and avoids hand-tuned variance schedules.",
      },
      { t: "text", value: " objective, absorbing both diffusion and score-based regimes into one loss." },
    ],
  },
  {
    kind: "p",
    segments: [
      { t: "text", value: "Unlike prior task-specific models, the conditioning signal is not fed through a separate encoder. Instead, conditions and targets are packed into the same sequence and distinguished only by a position-embedded view tag. This is a form of " },
      { t: "gap", term: "classifier-free guidance",
        confidence: "shaky",
        explanation:
          "A sampling trick: train the model with conditional and unconditional signals, then at inference extrapolate: ε_guided = ε_uncond + w·(ε_cond − ε_uncond). Higher w strengthens conditioning at some cost to diversity. The 'classifier-free' name distinguishes it from earlier work that trained a separate classifier.",
      },
      { t: "text", value: " extended across views — the same network can be asked, at inference time, to generate any view conditioned on any subset of the others. This symmetry is what makes OneDiffusion general rather than multi-task." },
    ],
  },
  {
    kind: "h2",
    text: "3.3 · Loss and view weighting",
  },
  {
    kind: "p",
    segments: [
      { t: "text", value: "The per-step loss is computed uniformly across all view tokens, but the sampling distribution over which views appear is heavily skewed toward image-text (60%) with the remainder split across the structural views. We found that over-representing depth or segmentation caused the model to degrade on the primary text-to-image task, consistent with observations from prior multi-task work." },
    ],
  },
];

type TraceStep = {
  id: string;
  kind: "thought" | "action" | "observation";
  label: string;
  detail: string;
  meta?: { tool?: string; latency?: string; tokens?: string };
  children?: TraceStep[];
};

const TRACE: TraceStep[] = [
  {
    id: "t1",
    kind: "thought",
    label: "The user is on §3.2 and asked about 'One-Gen'.",
    detail: "This is a concept name, not a pure factual lookup. Checking the KG for prereqs before answering.",
  },
  {
    id: "a1",
    kind: "action",
    label: "find_prerequisite_gaps(\"One-Gen\")",
    detail: "BFS over prereq edges from the target concept, filtering by confidence < 0.3.",
    meta: { tool: "knowledge_graph", latency: "142ms" },
  },
  {
    id: "o1",
    kind: "observation",
    label: "2 gaps identified",
    detail: "flow matching (0.00) · classifier-free guidance (0.31 — borderline shaky)",
    meta: { latency: "—" },
  },
  {
    id: "a2",
    kind: "action",
    label: "get_sections_up_to(\"3.2\")",
    detail: "Enforce the reading clamp — no spoilers past §3.2 of the current paper.",
    meta: { tool: "paper_parser", latency: "24ms" },
  },
  {
    id: "a3",
    kind: "action",
    label: "search_paper(\"One-Gen corpus composition\")",
    detail: "FAISS top-5 semantic search over paper chunks.",
    meta: { tool: "paper_parser", latency: "87ms", tokens: "318 ctx" },
  },
  {
    id: "t2",
    kind: "thought",
    label: "I'll brief 'flow matching' quickly, then define One-Gen grounded in §3.2.",
    detail: "Explanation calibrated to 'shaky' on classifier-free guidance (user has seen it once before, in DDPM paper). No need to re-explain from scratch.",
  },
  {
    id: "a4",
    kind: "action",
    label: "add_concept(\"One-Gen\", confidence=0.5, source=\"OneDiffusion §3.2 p5\")",
    detail: "Initial confidence: medium because the user is actively reading, not just skimming.",
    meta: { tool: "knowledge_graph", latency: "31ms" },
  },
];

export default function Reader() {
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  const togglePin = (term: string) =>
    setPinned((p) => ({ ...p, [term]: !p[term] }));

  return (
    <div className="ds-root flex h-screen flex-col bg-bg" data-theme="dark">
      {/* Topbar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-elevated px-4">
        <div className="flex items-center gap-3">
          <a
            href="#"
            className="flex items-center gap-2 text-sm font-medium text-fg hover:text-accent"
          >
            <span className="h-2 w-2 rounded-full bg-accent" />
            paper-mind
          </a>
          <span className="text-fg-subtle">/</span>
          <span className="truncate text-sm text-fg-default">{PAPER.title}</span>
          <Badge dot tone="accent">reading</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" leadingIcon={<Sparkles size={13} strokeWidth={1.5} />}>
            Ask
          </Button>
          <Input
            size="sm"
            placeholder="Jump to…"
            trailingIcon={<Kbd keys="cmd+k" size="sm" />}
            className="w-56"
          />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Paper pane */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[68ch] px-12 py-16">
            <header className="mb-12 border-b border-border pb-8">
              <div className="mb-3 font-mono text-xs uppercase tracking-caps text-fg-muted">
                {PAPER.venue}
              </div>
              <h1 className="mb-4 text-2xl font-semibold tracking-display text-fg">
                {PAPER.title}
              </h1>
              <p className="text-sm leading-snug text-fg-muted">
                {PAPER.authors.join(", ")}
              </p>
              <div className="mt-6 flex items-center gap-3 font-mono text-xs text-fg-subtle">
                <span>page {PAPER.pageCurrent} / {PAPER.pageTotal}</span>
                <span>·</span>
                <span>max read: {PAPER.pageMax}</span>
                <span>·</span>
                <span>~{Math.round((PAPER.pageMax / PAPER.pageTotal) * 100)}% complete</span>
              </div>
            </header>

            <article className="space-y-6">
              {PARAGRAPHS.map((block, i) => {
                if (block.kind === "h2") {
                  return (
                    <h2
                      key={i}
                      className="mt-10 pt-4 text-lg font-medium text-fg first:mt-0 first:pt-0"
                    >
                      {block.text}
                    </h2>
                  );
                }
                return (
                  <div key={i}>
                    <p className="text-base leading-body text-fg-default">
                      {block.segments.map((seg, j) => {
                        if (seg.t === "text") return <span key={j}>{seg.value}</span>;
                        return (
                          <GapTerm
                            key={j}
                            term={seg.term}
                            confidence={seg.confidence}
                            explanation={seg.explanation}
                            pinned={!!pinned[seg.term]}
                            onPin={() => togglePin(seg.term)}
                          />
                        );
                      })}
                    </p>

                    {/* Pinned explanations, flush with paper margin but visually nested */}
                    {block.segments.map((seg, j) =>
                      seg.t === "gap" && pinned[seg.term] ? (
                        <PinnedExplanation
                          key={`pin-${j}`}
                          term={seg.term}
                          confidence={seg.confidence}
                          explanation={seg.explanation}
                          onClose={() => togglePin(seg.term)}
                        />
                      ) : null,
                    )}
                  </div>
                );
              })}

              <footer className="pt-12 font-mono text-xs text-fg-subtle">
                — end of visible section. continue scrolling to enter §3.3 (locked past your max-read).
              </footer>
            </article>
          </div>
        </main>

        {/* Agent pane */}
        <AgentPanel />
      </div>
    </div>
  );
}

/* ── Paper-side components ──────────────────────────────────────────── */

function GapTerm({
  term,
  confidence,
  explanation,
  pinned,
  onPin,
}: {
  term: string;
  confidence: Confidence;
  explanation: string;
  pinned: boolean;
  onPin: () => void;
}) {
  const tone =
    confidence === "gap" ? "danger" : confidence === "shaky" ? "warning" : "success";
  return (
    <Popover
      width={340}
      trigger={
        <button
          type="button"
          className={cn(
            "relative inline cursor-pointer border-b border-dashed align-baseline text-fg",
            "transition-[background-color,border-color] duration-quick ease-smooth hover:bg-accent-soft",
            tone === "danger" && "border-danger",
            tone === "warning" && "border-warning",
            tone === "success" && "border-success",
            pinned && "bg-accent-soft",
          )}
        >
          {term}
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge tone={tone} dot>
            {confidence}
          </Badge>
          <Badge>prereq</Badge>
        </div>
        <h4 className="text-sm font-medium text-fg">{term}</h4>
        <p className="text-xs leading-body text-fg-muted">
          {explanation.slice(0, 180)}
          {explanation.length > 180 && "…"}
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="primary"
            leadingIcon={<Pin size={12} strokeWidth={1.5} />}
            onClick={onPin}
          >
            {pinned ? "Unpin" : "Pin explanation"}
          </Button>
          <Button size="sm" variant="ghost">
            I know this
          </Button>
        </div>
      </div>
    </Popover>
  );
}

function PinnedExplanation({
  term,
  confidence,
  explanation,
  onClose,
}: {
  term: string;
  confidence: Confidence;
  explanation: string;
  onClose: () => void;
}) {
  const tone =
    confidence === "gap" ? "danger" : confidence === "shaky" ? "warning" : "success";
  return (
    <aside
      className={cn(
        "relative my-4 overflow-hidden rounded-md border-l-2 bg-bg-elevated",
        tone === "danger" && "border-l-danger",
        tone === "warning" && "border-l-warning",
        tone === "success" && "border-l-success",
        "animate-[ds-fade-in_var(--dur-view)_var(--ease-out)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Pin size={11} strokeWidth={1.5} className="text-fg-muted" />
          <span className="font-mono text-[10px] uppercase tracking-caps text-fg-muted">
            pinned · {term}
          </span>
          <Badge tone={tone} dot>
            {confidence}
          </Badge>
        </div>
        <button
          onClick={onClose}
          aria-label="Unpin"
          className="rounded-sm p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div className="max-h-[220px] overflow-y-auto px-4 py-3">
        <p className="text-sm leading-body text-fg-default">{explanation}</p>
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="secondary">
            Ask the agent for more
          </Button>
          <Button size="sm" variant="ghost">
            Mark understood
          </Button>
        </div>
      </div>
    </aside>
  );
}

/* ── Agent pane ─────────────────────────────────────────────────────── */

function AgentPanel() {
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-border bg-bg">
      <header className="flex h-11 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-caps text-fg-muted">
            agent
          </span>
          <Badge dot tone="success">live</Badge>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] text-fg-subtle">
          <span>claude-sonnet-4-6</span>
          <span className="text-fg-subtle">·</span>
          <span>42ms p50</span>
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-6">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
            query
          </div>
          <p className="text-sm text-fg-default">
            what does "One-Gen" refer to here?
          </p>
        </div>

        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
              trace · 7 steps · 324ms total
            </div>
            <Button variant="ghost" size="sm">
              <Play size={11} strokeWidth={1.5} />
            </Button>
          </div>

          <TraceTree steps={TRACE} />
        </div>

        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
            response
          </div>
          <div className="space-y-4 text-sm leading-body text-fg-default">
            <p>
              <strong className="text-fg">One-Gen</strong> is the authors' merged training corpus:
              ~11M image-text pairs plus six auxiliary view types (depth, segmentation, pose, HED,
              canny, multi-view) serialized as sequences of 'views'.
            </p>
            <p>
              Before I go further — you've got a gap on{" "}
              <span className="border-b border-dashed border-danger text-fg">flow matching</span>
              {" "}and a shaky grasp of{" "}
              <span className="border-b border-dashed border-warning text-fg">
                classifier-free guidance
              </span>
              . Both are foundational for §3.3. Want me to explain those first, or keep going?
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border p-3">
        <Input
          placeholder="Ask about §3.2…"
          trailingIcon={<Kbd keys="enter" size="sm" />}
        />
      </footer>
    </aside>
  );
}

function TraceTree({ steps }: { steps: TraceStep[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="relative">
      {/* hairline rail */}
      <div className="absolute bottom-1 left-[7px] top-1 w-px bg-border" aria-hidden />
      <ul className="space-y-1.5">
        {steps.map((s) => (
          <TraceStepRow
            key={s.id}
            step={s}
            expanded={!!expanded[s.id]}
            onToggle={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
          />
        ))}
      </ul>
    </div>
  );
}

function TraceStepRow({
  step,
  expanded,
  onToggle,
}: {
  step: TraceStep;
  expanded: boolean;
  onToggle: () => void;
}) {
  const kindColor = {
    thought:     "text-fg-muted",
    action:      "text-accent",
    observation: "text-success",
  }[step.kind];

  return (
    <li className="relative pl-5">
      {/* Dot on the rail */}
      <span
        className={cn(
          "absolute left-[4px] top-[9px] h-1.5 w-1.5 rounded-full border border-bg-elevated",
          step.kind === "thought" && "bg-fg-muted",
          step.kind === "action" && "bg-accent",
          step.kind === "observation" && "bg-success",
        )}
      />
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-start gap-1.5 rounded-sm text-left",
          "transition-colors duration-quick ease-smooth hover:bg-bg-hover",
          "px-1.5 py-1",
        )}
      >
        <span className="mt-0.5 text-fg-subtle">
          {expanded ? (
            <ChevronDown size={11} strokeWidth={1.5} />
          ) : (
            <ChevronRight size={11} strokeWidth={1.5} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-caps",
                kindColor,
              )}
            >
              {step.kind}
            </span>
            {step.meta?.tool && (
              <span className="font-mono text-[10px] text-fg-subtle">
                {step.meta.tool}
              </span>
            )}
            {step.meta?.latency && (
              <span className="ml-auto font-mono text-[10px] text-fg-subtle">
                {step.meta.latency}
              </span>
            )}
            {step.meta?.tokens && (
              <span className="font-mono text-[10px] text-fg-subtle">
                {step.meta.tokens}
              </span>
            )}
          </div>
          <div
            className={cn(
              "mt-0.5 text-xs",
              step.kind === "action" ? "font-mono" : "",
              "text-fg-default",
            )}
          >
            {step.label}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 rounded-sm border-l border-border pl-3 text-xs leading-body text-fg-muted">
          {step.detail}
        </div>
      )}
    </li>
  );
}

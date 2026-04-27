import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Filter,
  Info,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Input,
  Kbd,
  Popover,
  Select,
  Tooltip,
} from "./primitives";

/* ────────────────────────────────────────────────────────────────────
   Component sheet — primitives shown in their real states.
   No lorem ipsum: every example uses paper-mind copy so we can see how
   labels, density, and typography hold up against actual product text.
   ──────────────────────────────────────────────────────────────────── */

export default function Components() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  return (
    <div className="ds-root min-h-screen" data-theme={theme}>
      <div className="mx-auto max-w-[1100px] px-10 py-16">
        <header className="mb-16 flex items-start justify-between border-b border-border pb-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-caps text-fg-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              paper-mind / components / v0.1
            </div>
            <h1 className="text-2xl font-semibold tracking-display text-fg">
              Primitives.
            </h1>
            <p className="mt-3 max-w-[58ch] text-md leading-snug text-fg-muted">
              Eight components, every state, real product copy.
              Tab through to verify focus rings. Everything reads from the
              token system — no hex anywhere.
            </p>
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </header>

        {/* Buttons */}
        <Section
          eyebrow="01 / Button"
          title="Four variants, two sizes"
          rationale={
            <>
              Primary lives on accent. Secondary is the workhorse — bordered
              elevated surface, used everywhere except the single primary
              CTA per view. Ghost has no chrome until you hover. Press
              feedback is an 80ms 0.98 scale; hover-leave is 120ms.
            </>
          }
        >
          <Spec label="Variants — md size, default state">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Open paper</Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="danger" leadingIcon={<Trash2 size={13} strokeWidth={1.5} />}>
                Delete
              </Button>
            </div>
          </Spec>

          <Spec label="Sizes">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">Add concept</Button>
              <Button variant="primary" size="md">Add concept</Button>
              <Button variant="secondary" size="sm">Refresh</Button>
              <Button variant="secondary" size="md">Refresh</Button>
            </div>
          </Spec>

          <Spec label="With icons">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" leadingIcon={<Plus size={13} strokeWidth={1.5} />}>
                Upload paper
              </Button>
              <Button variant="secondary" trailingIcon={<ArrowRight size={13} strokeWidth={1.5} />}>
                Continue reading
              </Button>
              <Button variant="ghost" leadingIcon={<Filter size={13} strokeWidth={1.5} />}>
                Filter
              </Button>
              <Button variant="secondary" size="sm" aria-label="Confirm">
                <Check size={13} strokeWidth={1.5} />
              </Button>
            </div>
          </Spec>

          <Spec label="States">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" loading>Generating…</Button>
              <Button variant="secondary" disabled>Disabled</Button>
              <Button variant="primary" disabled>Disabled primary</Button>
            </div>
          </Spec>
        </Section>

        {/* Inputs */}
        <Section
          eyebrow="02 / Input"
          title="Bordered, sized to the type"
          rationale={
            <>
              Heights match buttons exactly (28/32px) so they line up in
              filter bars without alignment math. Focus state lights the
              border in accent and adds a 2px ring. Icons sit at 13px —
              same as the body text — so the optical weight matches.
            </>
          }
        >
          <Spec label="Default + with icons">
            <div className="grid grid-cols-2 gap-4">
              <Input placeholder="Search papers" />
              <Input
                placeholder="Search concepts"
                leadingIcon={<Search size={13} strokeWidth={1.5} />}
              />
              <Input
                label="Paper title"
                placeholder="One Diffusion to Generate Them All"
              />
              <Input
                label="Search"
                placeholder="Find a session"
                leadingIcon={<Search size={13} strokeWidth={1.5} />}
                trailingIcon={<Kbd keys="cmd+k" size="sm" />}
              />
            </div>
          </Spec>

          <Spec label="With description and error">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="OpenAI key"
                placeholder="sk-…"
                description="Used for embeddings only. Stored locally."
              />
              <Input
                label="Confidence threshold"
                defaultValue="-0.4"
                error="Must be between 0 and 1."
              />
            </div>
          </Spec>

          <Spec label="Sizes + disabled">
            <div className="grid grid-cols-3 gap-4">
              <Input size="sm" placeholder="Small input" />
              <Input size="md" placeholder="Medium input" />
              <Input placeholder="Disabled" disabled />
            </div>
          </Spec>
        </Section>

        {/* Selects */}
        <Section
          eyebrow="03 / Select"
          title="Native, styled to match"
          rationale={
            <>
              Native <code className="font-mono text-fg-muted">{"<select>"}</code>{" "}
              with custom chevron. Native gives us free OS-level keyboard
              navigation and screen-reader behavior. Custom Radix Select
              comes only when we need search-inside-list (Cmd-K territory).
            </>
          }
        >
          <Spec label="Default + label + sizes">
            <div className="grid grid-cols-3 gap-4">
              <Select label="Sort by" defaultValue="recent">
                <option value="recent">Most recent</option>
                <option value="confidence">Confidence (high → low)</option>
                <option value="alpha">Alphabetical</option>
              </Select>
              <Select label="Filter">
                <option>All sessions</option>
                <option>This week</option>
                <option>This month</option>
              </Select>
              <Select size="sm" defaultValue="claude">
                <option value="claude">Claude (Anthropic)</option>
                <option value="ft">Fine-tuned · Llama 3 8B</option>
              </Select>
            </div>
          </Spec>
        </Section>

        {/* Card */}
        <Section
          eyebrow="04 / Card"
          title="Hairline border, no shadow"
          rationale={
            <>
              Borders carry the elevation. Header / Body / Footer are
              composable — split when content needs structure, collapse to
              a bare wrapper when it doesn't. Padding is 5 (20px) and never
              variable — density is global, not per-card.
            </>
          }
        >
          <Spec label="Composed (header + body + footer)">
            <Card bare className="max-w-md">
              <CardHeader
                eyebrow="Concept · Diffusion models"
                title="One-Gen training procedure"
                description="OneDiffusion · page 5 of 14"
                actions={
                  <Badge tone="warning" dot>
                    shaky
                  </Badge>
                }
              />
              <CardBody>
                <p className="text-sm leading-snug text-fg-default">
                  The model is trained on text, depth, segmentation, pose,
                  and HED views as a unified sequence. You've encountered
                  the unified objective but not the per-task loss
                  weighting yet.
                </p>
              </CardBody>
              <CardFooter>
                <Button variant="ghost" size="sm">
                  Skip for now
                </Button>
                <Button variant="primary" size="sm">
                  Explain prereqs first
                </Button>
              </CardFooter>
            </Card>
          </Spec>

          <Spec label="Bare (table-like content edge-to-edge)">
            <Card bare className="max-w-md">
              <div className="divide-y divide-border">
                {[
                  ["denoising score matching", "0.62"],
                  ["forward process", "0.41"],
                  ["UNet architecture", "0.78"],
                  ["classifier-free guidance", "0.18"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-bg-hover"
                  >
                    <span className="text-fg-default">{k}</span>
                    <span className="font-mono text-xs text-fg-muted">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Spec>
        </Section>

        {/* Badge */}
        <Section
          eyebrow="05 / Badge"
          title="Mono caps, low chroma"
          rationale={
            <>
              All-caps mono with positive tracking — reads as metadata, not
              decoration. Soft variant for status; outline for emphasis.
              Used for confidence states (gap / shaky / solid), agent
              actions (live / cached), and source attribution.
            </>
          }
        >
          <Spec label="Tones — soft">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>neutral</Badge>
              <Badge tone="accent">accent</Badge>
              <Badge tone="success">solid</Badge>
              <Badge tone="warning">shaky</Badge>
              <Badge tone="danger">gap</Badge>
            </div>
          </Spec>
          <Spec label="With dot">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success" dot>understood</Badge>
              <Badge tone="warning" dot>shaky · 41%</Badge>
              <Badge tone="danger" dot>gap</Badge>
              <Badge tone="accent" dot>live</Badge>
              <Badge dot>cached</Badge>
            </div>
          </Spec>
          <Spec label="Outline + with icon">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">draft</Badge>
              <Badge variant="outline" tone="accent">phase 2</Badge>
              <Badge tone="accent" icon={<Sparkles size={10} strokeWidth={1.5} />}>
                agent action
              </Badge>
              <Badge tone="success" icon={<Check size={10} strokeWidth={1.5} />}>
                verified
              </Badge>
            </div>
          </Spec>
        </Section>

        {/* Kbd */}
        <Section
          eyebrow="06 / Kbd"
          title="Keyboard shortcut display"
          rationale={
            <>
              Pass shorthand (
              <code className="font-mono text-fg-muted">cmd+k</code>) and
              the component renders symbols at the right size. Sits on the
              type baseline. Used in tooltips, command palette, and the
              Cmd-K hint at the right side of search inputs.
            </>
          }
        >
          <Spec label="Inline with body text">
            <p className="text-sm text-fg-default">
              Open the command palette with <Kbd keys="cmd+k" /> from
              anywhere. Press <Kbd keys="esc" /> to dismiss, or{" "}
              <Kbd keys="enter" /> to confirm.
            </p>
          </Spec>
          <Spec label="Combos and sizes">
            <div className="flex flex-wrap items-center gap-4">
              <Kbd keys="cmd+shift+p" />
              <Kbd keys="cmd+shift+k" size="sm" />
              <Kbd keys="alt+shift+enter" />
              <Kbd keys="up" />
              <Kbd keys="down" />
              <Kbd>?</Kbd>
            </div>
          </Spec>
        </Section>

        {/* Tooltip */}
        <Section
          eyebrow="07 / Tooltip"
          title="Mono content, 200ms delay"
          rationale={
            <>
              Built on Radix for collision detection and focus management.
              Mono content — these are for metadata and tool-call traces,
              not paragraphs. 200ms open delay so they don't pop on every
              hover; instant close.
            </>
          }
        >
          <Spec label="Hover the chips">
            <div className="flex flex-wrap items-center gap-3">
              <Tooltip content="latency · 142ms">
                <Badge tone="accent" dot>find_prerequisite_gaps</Badge>
              </Tooltip>
              <Tooltip content="confidence increased from 0.34 → 0.51">
                <Badge tone="success" dot>understood</Badge>
              </Tooltip>
              <Tooltip content={<>318 input · 47 output · <span className="text-fg-muted">claude-sonnet-4-6</span></>} side="right">
                <Button variant="ghost" size="sm" leadingIcon={<Info size={13} strokeWidth={1.5} />}>
                  call meta
                </Button>
              </Tooltip>
              <Tooltip content="user is on page 5 / max read: 8" side="bottom">
                <Badge>page 5/14</Badge>
              </Tooltip>
            </div>
          </Spec>
        </Section>

        {/* Popover */}
        <Section
          eyebrow="08 / Popover"
          title="Click-triggered, holds rich content"
          rationale={
            <>
              Click open, click outside or <Kbd keys="esc" /> to close.
              For prereq gap explanations, filter controls, KG node detail
              panels. Same surface as tooltip but bigger and quieter.
            </>
          }
        >
          <Spec label="Inline gap explanation (the prereq surfacing pattern)">
            <p className="max-w-[58ch] text-base leading-body text-fg-default">
              The forward diffusion process gradually adds Gaussian noise
              to data over T timesteps according to a fixed{" "}
              <Popover
                width={320}
                trigger={
                  <button
                    className="cursor-pointer border-b border-dashed border-accent text-fg underline-offset-4 hover:bg-accent-soft"
                    type="button"
                  >
                    variance schedule
                  </button>
                }
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge tone="warning" dot>shaky · 31%</Badge>
                    <Badge>prereq</Badge>
                  </div>
                  <h4 className="text-sm font-medium text-fg">
                    Variance schedule
                  </h4>
                  <p className="text-xs leading-body text-fg-muted">
                    A pre-set sequence of how much noise gets added at each
                    timestep. Linear, cosine, and sigmoid are common. The
                    schedule controls how the model perceives "noisy" vs
                    "clean" during training.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Button size="sm" variant="primary">
                      Pin to paper
                    </Button>
                    <Button size="sm" variant="ghost">
                      I know this
                    </Button>
                  </div>
                </div>
              </Popover>
              , defining how much noise is injected at each step.
            </p>
          </Spec>

          <Spec label="As a filter menu">
            <Popover
              width={240}
              align="start"
              trigger={
                <Button variant="secondary" leadingIcon={<Filter size={13} strokeWidth={1.5} />}>
                  Confidence
                </Button>
              }
            >
              <div className="space-y-3">
                <div className="font-mono text-xs uppercase tracking-caps text-fg-muted">
                  Filter
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Solid", tone: "success" as const },
                    { label: "Shaky", tone: "warning" as const },
                    { label: "Gap", tone: "danger" as const },
                  ].map((opt) => (
                    <label
                      key={opt.label}
                      className="flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5 hover:bg-bg-hover"
                    >
                      <input
                        type="checkbox"
                        defaultChecked
                        className="h-3.5 w-3.5 accent-[color:var(--accent)]"
                      />
                      <Badge tone={opt.tone} dot>{opt.label.toLowerCase()}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            </Popover>
          </Spec>
        </Section>

        {/* Composition */}
        <Section
          eyebrow="09 / Composition"
          title="A realistic mini-surface"
          rationale={
            <>
              Putting them together. This is roughly what a filter row in
              the knowledge graph view will look like — primitives doing
              the work, no custom one-offs.
            </>
          }
        >
          <Card bare>
            <div className="flex items-center gap-3 border-b border-border px-5 py-3">
              <Input
                size="sm"
                placeholder="Search concepts…"
                leadingIcon={<Search size={13} strokeWidth={1.5} />}
                trailingIcon={<Kbd keys="cmd+k" size="sm" />}
              />
              <Select size="sm" defaultValue="confidence" className="w-44">
                <option value="confidence">Sort: Confidence</option>
                <option value="recent">Sort: Most recent</option>
                <option value="alpha">Sort: A → Z</option>
              </Select>
              <div className="flex items-center gap-2">
                <Tooltip content="hide gap nodes from view">
                  <Button variant="ghost" size="sm">
                    <Filter size={13} strokeWidth={1.5} />
                  </Button>
                </Tooltip>
                <Button variant="primary" size="sm" trailingIcon={<ArrowUpRight size={13} strokeWidth={1.5} />}>
                  Open in graph
                </Button>
              </div>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "denoising", conf: 0.62, tone: "warning" as const, label: "shaky" },
                { name: "forward process", conf: 0.41, tone: "warning" as const, label: "shaky" },
                { name: "UNet architecture", conf: 0.78, tone: "success" as const, label: "solid" },
                { name: "classifier-free guidance", conf: 0.18, tone: "danger" as const, label: "gap" },
              ].map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between px-5 py-2.5 hover:bg-bg-hover"
                >
                  <div className="flex items-center gap-3">
                    <Badge tone={row.tone} dot>{row.label}</Badge>
                    <span className="text-sm text-fg-default">{row.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-xs text-fg-muted">
                      {row.conf.toFixed(2)}
                    </span>
                    <Button variant="ghost" size="sm" aria-label="Dismiss">
                      <X size={13} strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Section>

        <footer className="mt-16 flex items-center justify-between border-t border-border pt-8 font-mono text-xs text-fg-subtle">
          <div>paper-mind/components/v0.1</div>
          <div>radix · lucide · tailwind</div>
        </footer>
      </div>
    </div>
  );
}

/* ── Local helpers ────────────────────────────────────────────────── */

function Section(props: {
  eyebrow: string;
  title: string;
  rationale: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-16">
      <div className="mb-6 flex items-baseline justify-between gap-8">
        <div>
          <div className="mb-2 font-mono text-xs uppercase tracking-caps text-fg-muted">
            {props.eyebrow}
          </div>
          <h2 className="text-lg font-medium text-fg">{props.title}</h2>
        </div>
        <p className="max-w-[52ch] text-xs leading-body text-fg-muted">
          {props.rationale}
        </p>
      </div>
      <div className="space-y-5">{props.children}</div>
    </section>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated">
      <div className="border-b border-border px-5 py-2.5 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        {label}
      </div>
      <div className="px-5 py-6">{children}</div>
    </div>
  );
}

function ThemeToggle(props: {
  theme: "dark" | "light";
  onChange: (t: "dark" | "light") => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated p-1">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          onClick={() => props.onChange(t)}
          className={[
            "rounded-sm px-3 py-1 font-mono text-xs uppercase tracking-caps transition-colors duration-quick ease-smooth",
            props.theme === t
              ? "bg-accent-soft text-fg"
              : "text-fg-muted hover:text-fg",
          ].join(" ")}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

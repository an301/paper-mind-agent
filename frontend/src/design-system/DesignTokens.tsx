import { useEffect, useState } from "react";

/* ────────────────────────────────────────────────────────────────────
   Design tokens spec sheet.
   Shows: fonts (with rationale), grayscale ramp (hex + OKLCH), accent
   variants, type scale, radii, motion, shadows. Switch dark/light to
   verify both modes are equally considered.
   ──────────────────────────────────────────────────────────────────── */

const GRAY_STEPS = [
  { step: 0,  oklch: "oklch(0.145 0.003 264)", role: "canvas" },
  { step: 1,  oklch: "oklch(0.175 0.004 264)", role: "elevated" },
  { step: 2,  oklch: "oklch(0.205 0.005 264)", role: "raised" },
  { step: 3,  oklch: "oklch(0.245 0.006 264)", role: "hover" },
  { step: 4,  oklch: "oklch(0.295 0.007 264)", role: "active" },
  { step: 5,  oklch: "oklch(0.355 0.008 264)", role: "border-strong" },
  { step: 6,  oklch: "oklch(0.435 0.009 264)", role: "" },
  { step: 7,  oklch: "oklch(0.535 0.010 264)", role: "fg-subtle" },
  { step: 8,  oklch: "oklch(0.665 0.010 264)", role: "fg-muted" },
  { step: 9,  oklch: "oklch(0.785 0.008 264)", role: "" },
  { step: 10, oklch: "oklch(0.880 0.006 264)", role: "fg-default" },
  { step: 11, oklch: "oklch(0.965 0.003 264)", role: "fg" },
];

const TYPE_SCALE = [
  { name: "2xl", px: 40, lh: 46, tracking: "-0.022em", role: "Display — landing hero, single sentence theses" },
  { name: "xl",  px: 28, lh: 34, tracking: "-0.015em", role: "View headings — page titles" },
  { name: "lg",  px: 20, lh: 28, tracking: "-0.005em", role: "Section headings — graph filters, panel titles" },
  { name: "base",px: 16, lh: 26, tracking: "0",        role: "Reading body — paper content at 16/1.6" },
  { name: "md",  px: 14, lh: 20, tracking: "0",        role: "Secondary body — sidebar items" },
  { name: "sm",  px: 13, lh: 18, tracking: "0",        role: "Default UI — buttons, inputs, table rows" },
  { name: "xs",  px: 12, lh: 16, tracking: "0",        role: "Micro labels, all-caps with +0.06em tracking" },
];

const ACCENT_VARIANTS = [
  { var: "--accent",        oklch: "oklch(0.66 0.21 254)", role: "Primary state, active nav, agent action highlight" },
  { var: "--accent-hover",  oklch: "oklch(0.71 0.20 254)", role: "Hover (lighter, snappier)" },
  { var: "--accent-active", oklch: "oklch(0.61 0.21 254)", role: "Pressed (slightly compressed)" },
  { var: "--accent-soft",   oklch: "oklch(0.66 0.21 254 / 0.12)", role: "Tinted backgrounds, selected rows" },
  { var: "--accent-ring",   oklch: "oklch(0.66 0.21 254 / 0.40)", role: "Focus rings (2px, 2px offset)" },
];

function computedColor(varName: string): string {
  // Resolve a CSS var to its computed rgb so we can show the hex value.
  if (typeof window === "undefined") return "";
  const probe = document.createElement("div");
  probe.style.color = `var(${varName})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  probe.remove();
  // Convert "rgb(r, g, b)" or "rgba(r,g,b,a)" → #rrggbb
  const m = rgb.match(/rgba?\(([^)]+)\)/);
  if (!m) return rgb;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b] = parts;
  const hex = "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
  return hex.toUpperCase();
}

export default function DesignTokens() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [resolvedHex, setResolvedHex] = useState<Record<string, string>>({});

  // Resolve the actual hex of every token after mount (and after theme switch)
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".ds-root");
    if (!root) return;
    root.setAttribute("data-theme", theme);

    requestAnimationFrame(() => {
      const next: Record<string, string> = {};
      for (const g of GRAY_STEPS) next[`--gray-${g.step}`] = computedColor(`--gray-${g.step}`);
      for (const a of ACCENT_VARIANTS) next[a.var] = computedColor(a.var);
      next["--bg"] = computedColor("--bg");
      next["--fg"] = computedColor("--fg");
      setResolvedHex(next);
    });
  }, [theme]);

  return (
    <div className="ds-root min-h-screen" data-theme={theme}>
      <div className="mx-auto max-w-[1100px] px-10 py-16">
        {/* Header */}
        <header className="mb-16 flex items-start justify-between border-b border-border pb-10">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-caps text-fg-muted">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              paper-mind / design system / v0.1
            </div>
            <h1 className="text-2xl font-semibold tracking-display text-fg">
              Design tokens.
            </h1>
            <p className="mt-3 max-w-[58ch] text-md leading-snug text-fg-muted">
              Dark-first. Geist on Geist Mono. One accent — a precise blue,
              not a marketing gradient. Every component reads from these
              tokens, never raw hex.
            </p>
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </header>

        {/* Typography */}
        <Section
          eyebrow="01 / Typography"
          title="Geist Variable on Geist Mono"
          rationale={
            <>
              <strong className="text-fg">Body — Geist Variable.</strong>{" "}
              Designed for UI, not editorial. Reads cleanly at 13px (where
              Inter feels slightly thin), holds shape under aggressive
              negative tracking on display sizes, and ships with stylistic
              sets (<code className="font-mono text-fg-muted">ss01</code>,{" "}
              <code className="font-mono text-fg-muted">cv11</code>) that
              tighten ambiguous letterforms.{" "}
              <strong className="text-fg">Mono — Geist Mono.</strong> Same
              family, identical metrics, true tabular figures. No mixed-family
              vertical alignment artifacts.
            </>
          }
        >
          <div className="space-y-4 rounded-md border border-border bg-bg-elevated p-8">
            {TYPE_SCALE.map((t) => (
              <div
                key={t.name}
                className="grid items-baseline gap-6 border-b border-border pb-4 last:border-0 last:pb-0"
                style={{ gridTemplateColumns: "80px 1fr 280px" }}
              >
                <div className="font-mono text-xs uppercase tracking-caps text-fg-subtle">
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: `${t.px}px`,
                    lineHeight: `${t.lh}px`,
                    letterSpacing: t.tracking,
                  }}
                  className="text-fg"
                >
                  The quick brown fox 0123456789
                </div>
                <div className="font-mono text-xs leading-snug text-fg-muted">
                  {t.px}/{t.lh} · {t.tracking}
                  <br />
                  <span className="text-fg-subtle">{t.role}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Card eyebrow="Body specimen" mono={false}>
              <p className="text-base leading-body text-fg-default">
                Diffusion models learn to reverse a gradual noising process,
                producing samples by iteratively denoising from pure
                Gaussian noise. The forward process adds noise at each step
                according to a fixed variance schedule.
              </p>
            </Card>
            <Card eyebrow="Mono specimen" mono>
              <p className="text-sm text-fg-default">
                <span className="text-fg-muted">{"["}thought{"]"}</span>{" "}
                user is on page 5 of 14.
                <br />
                <span className="text-fg-muted">{"["}action{"]"}</span>{" "}
                find_prerequisite_gaps("denoising")
                <br />
                <span className="text-fg-muted">{"["}observation{"]"}</span>{" "}
                gaps: ["forward process"]{" "}
                <span className="text-fg-subtle">42ms · 318 tok</span>
              </p>
            </Card>
          </div>
        </Section>

        {/* Grayscale */}
        <Section
          eyebrow="02 / Grayscale"
          title="12-step OKLCH ramp"
          rationale={
            <>
              Specced in OKLCH so each step is perceptually uniform — not
              the lumpy lightness curve you get from default Tailwind grays.
              Slightly cool (chroma at <code className="font-mono">264</code>)
              so the dark surfaces don't feel dead. Step 0 is the canvas;
              step 11 is the brightest text. Borders are{" "}
              <code className="font-mono">rgba(255,255,255,0.06–0.10)</code>,
              not a gray step — keeps hairlines luminous on any background.
            </>
          }
        >
          <div className="overflow-hidden rounded-md border border-border bg-bg-elevated">
            <div className="grid grid-cols-12">
              {GRAY_STEPS.map((g) => (
                <div
                  key={g.step}
                  className="relative aspect-square border-r border-border last:border-r-0"
                  style={{ background: `var(--gray-${g.step})` }}
                >
                  <div
                    className="absolute inset-x-2 bottom-2 font-mono text-xs"
                    style={{ color: g.step > 6 ? "var(--gray-0)" : "var(--gray-11)" }}
                  >
                    {g.step}
                  </div>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border">
              {GRAY_STEPS.map((g) => (
                <div
                  key={g.step}
                  className="grid items-center gap-4 px-5 py-2.5 font-mono text-xs"
                  style={{ gridTemplateColumns: "32px 110px 230px 1fr" }}
                >
                  <span className="text-fg-subtle">{g.step}</span>
                  <span className="text-fg">{resolvedHex[`--gray-${g.step}`] || "—"}</span>
                  <span className="text-fg-muted">{g.oklch}</span>
                  <span className="text-fg-subtle">{g.role}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Accent */}
        <Section
          eyebrow="03 / Accent"
          title="Electric blue, OKLCH-defined"
          rationale={
            <>
              One accent. Hue locked at <code className="font-mono">254</code>{" "}
              (cold blue, no violet drift), chroma high enough to feel
              electric without going cyan. Hover is +5L (snappier), active is
              −5L (compressed). Specced in OKLCH so the hue stays true across
              variants — the L offset doesn't cause the color to wander into
              purple territory the way HSL would. Used on active states,
              agent actions, focus rings. Never as a gradient.
            </>
          }
        >
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md border border-border bg-bg-elevated p-6">
              <div className="mb-4 h-32 rounded-sm bg-accent" />
              <div className="font-mono text-xs text-fg-muted">--accent</div>
              <div className="mt-1 font-mono text-xs text-fg">
                {resolvedHex["--accent"] || "—"}
              </div>
              <div className="mt-3 text-xs leading-snug text-fg-subtle">
                Primary accent.
              </div>
            </div>
            <div className="rounded-md border border-border bg-bg-elevated p-6">
              <div className="mb-4 h-32 rounded-sm bg-accent-hover" />
              <div className="font-mono text-xs text-fg-muted">--accent-hover</div>
              <div className="mt-1 font-mono text-xs text-fg">
                {resolvedHex["--accent-hover"] || "—"}
              </div>
              <div className="mt-3 text-xs leading-snug text-fg-subtle">
                +5L from base.
              </div>
            </div>
            <div className="rounded-md border border-border bg-bg-elevated p-6">
              <div className="mb-4 h-32 rounded-sm bg-accent-active" />
              <div className="font-mono text-xs text-fg-muted">--accent-active</div>
              <div className="mt-1 font-mono text-xs text-fg">
                {resolvedHex["--accent-active"] || "—"}
              </div>
              <div className="mt-3 text-xs leading-snug text-fg-subtle">
                −5L, compressed.
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-border bg-bg-elevated">
            <div className="divide-y divide-border">
              {ACCENT_VARIANTS.map((a) => (
                <div
                  key={a.var}
                  className="grid items-center gap-4 px-5 py-3"
                  style={{ gridTemplateColumns: "24px 160px 240px 1fr" }}
                >
                  <span
                    className="h-4 w-4 rounded-sm border border-border"
                    style={{ background: `var(${a.var})` }}
                  />
                  <span className="font-mono text-xs text-fg">{a.var}</span>
                  <span className="font-mono text-xs text-fg-muted">{a.oklch}</span>
                  <span className="text-xs text-fg-subtle">{a.role}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Semantic surfaces */}
        <Section
          eyebrow="04 / Surfaces & borders"
          title="Hairlines do the work"
          rationale={
            <>
              Five surface levels, climbed by lightness rather than shadow.
              Borders are partial-opacity whites so they sit luminous on any
              underlying tone. No drop shadows on cards — shadows are
              reserved for popovers and modals (elevation moments, not
              decoration).
            </>
          }
        >
          <div className="grid grid-cols-5 gap-3">
            {[
              { var: "--bg", label: "bg", role: "canvas" },
              { var: "--bg-elevated", label: "bg-elevated", role: "card surface" },
              { var: "--bg-raised", label: "bg-raised", role: "raised on card" },
              { var: "--bg-hover", label: "bg-hover", role: "row hover" },
              { var: "--bg-active", label: "bg-active", role: "pressed" },
            ].map((s) => (
              <div
                key={s.var}
                className="rounded-md border border-border p-5"
                style={{ background: `var(${s.var})` }}
              >
                <div className="font-mono text-xs text-fg">{s.label}</div>
                <div className="mt-2 text-xs text-fg-muted">{s.role}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-5">
              <div className="font-mono text-xs text-fg">--border</div>
              <div className="mt-2 font-mono text-xs text-fg-muted">
                rgba(255,255,255,0.06)
              </div>
            </div>
            <div className="rounded-md border border-border-strong p-5">
              <div className="font-mono text-xs text-fg">--border-strong</div>
              <div className="mt-2 font-mono text-xs text-fg-muted">
                rgba(255,255,255,0.10)
              </div>
            </div>
          </div>
        </Section>

        {/* Radii + motion */}
        <Section
          eyebrow="05 / Radii & motion"
          title="Sharp by default"
          rationale={
            <>
              Three radii, never bigger than 8px. Corners earn their roundness
              — input fields and buttons get 4px because they're small;
              surfaces stop at 8px. No pill buttons. Motion uses one custom
              cubic-bezier; UI feedback is 120–160ms; view transitions
              280–320ms. Hover-leave is faster than hover-enter (which is
              instant) because the eye is more sensitive to lingering than
              appearing.
            </>
          }
        >
          <div className="grid grid-cols-3 gap-4">
            {[
              { name: "--radius-sm", val: "4px", role: "buttons, inputs, kbd" },
              { name: "--radius-md", val: "6px", role: "small surfaces, badges" },
              { name: "--radius-lg", val: "8px", role: "panels, side sheets" },
            ].map((r) => (
              <div
                key={r.name}
                className="border border-border bg-bg-elevated p-6"
                style={{ borderRadius: `var(${r.name})` }}
              >
                <div className="font-mono text-xs text-fg">{r.name}</div>
                <div className="mt-1 font-mono text-xs text-fg-muted">{r.val}</div>
                <div className="mt-3 text-xs text-fg-subtle">{r.role}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-border bg-bg-elevated">
            <div className="divide-y divide-border">
              {[
                { name: "--ease-out", val: "cubic-bezier(0.2, 0.8, 0.2, 1)", role: "default UI ease" },
                { name: "--dur-quick", val: "120ms", role: "hover leave" },
                { name: "--dur-base",  val: "160ms", role: "UI feedback (focus, press, toggle)" },
                { name: "--dur-view",  val: "320ms", role: "view transitions, panel slide" },
              ].map((m) => (
                <div
                  key={m.name}
                  className="grid items-center gap-4 px-5 py-3"
                  style={{ gridTemplateColumns: "180px 280px 1fr" }}
                >
                  <span className="font-mono text-xs text-fg">{m.name}</span>
                  <span className="font-mono text-xs text-fg-muted">{m.val}</span>
                  <span className="text-xs text-fg-subtle">{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Footer */}
        <footer className="mt-16 flex items-center justify-between border-t border-border pt-8 font-mono text-xs text-fg-subtle">
          <div>paper-mind/design-system</div>
          <div>react · vite · tailwind · CSS variables</div>
        </footer>
      </div>
    </div>
  );
}

/* ── Subcomponents (locally scoped — primitives come in Step 2) ─────── */

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
      {props.children}
    </section>
  );
}

function Card(props: { eyebrow: string; mono: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-6">
      <div className="mb-4 font-mono text-xs uppercase tracking-caps text-fg-muted">
        {props.eyebrow}
      </div>
      <div className={props.mono ? "font-mono" : ""}>{props.children}</div>
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

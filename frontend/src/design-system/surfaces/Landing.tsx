import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "../util";
import { Badge, Button, Kbd } from "../primitives";

/* ────────────────────────────────────────────────────────────────────
   Landing page.
   Thesis above the fold. Live interactive mini-graph demo (not a
   screenshot). Scroll reveals one real screenshot per section with a
   one-line caption. Footer is a single row.
   ──────────────────────────────────────────────────────────────────── */

export default function Landing() {
  return (
    <div className="ds-root min-h-screen bg-bg" data-theme="dark">
      {/* Nav */}
      <nav className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur">
        <a href="#" className="flex items-center gap-2 text-sm font-medium text-fg">
          <span className="h-2 w-2 rounded-full bg-accent" />
          paper-mind
        </a>
        <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-caps">
          <a href="#reader" className="px-3 py-1 text-fg-muted hover:text-fg">reader</a>
          <a href="#graph" className="px-3 py-1 text-fg-muted hover:text-fg">graph</a>
          <a href="#dashboard" className="px-3 py-1 text-fg-muted hover:text-fg">sessions</a>
          <a href="#components" className="px-3 py-1 text-fg-muted hover:text-fg">system</a>
        </div>
        <div className="flex items-center gap-2">
          <Kbd keys="cmd+k" size="sm" />
          <a
            href="https://github.com/anishnambirajan/paper-mind-agent"
            className="font-mono text-[10px] uppercase tracking-caps text-fg-muted hover:text-fg"
          >
            github
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1200px] grid-cols-5 gap-16 px-8 pt-24 pb-20">
        <div className="col-span-2 flex flex-col justify-center">
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
            <span className="h-1 w-1 rounded-full bg-accent" />
            adaptive ai paper-reading agent
            <Badge variant="outline" tone="accent">alpha</Badge>
          </div>
          <h1 className="text-[40px] font-medium leading-[1.08] tracking-display text-fg">
            A reading companion that remembers what you understand — and
            what you don't.
          </h1>
          <p className="mt-6 max-w-[42ch] text-base leading-body text-fg-muted">
            paper-mind is a ReAct-loop agent that reads ML papers with you,
            runs BFS over a per-user knowledge graph to surface prerequisite
            gaps, and calibrates every explanation to your current expertise.
            Dark by default. Keyboard-first. No chat bubbles.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              trailingIcon={<ArrowUpRight size={13} strokeWidth={1.5} />}
              onClick={() => (window.location.hash = "#reader")}
            >
              Open reader
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => (window.location.hash = "#graph")}
            >
              See the graph
            </Button>
          </div>
          <div className="mt-6 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
            react · fastapi · anthropic · faiss · langgraph
          </div>
        </div>

        {/* Live demo */}
        <div className="col-span-3">
          <DemoGraph />
        </div>
      </section>

      {/* Feature rows — one per section, sized for real content */}
      <Feature
        eyebrow="reader"
        title="A precision instrument, not a chat app."
        body="Two panes. Left: paper at 68ch, set in Geist at 16/1.6. Right: the agent's ReAct trace as a collapsible tree — Thought → Action → Observation, with monospace metadata for tool names, latency, and token cost. Click any concept in the paper for an inline gap explanation, calibrated to what you already know."
        shot={<ShotReader />}
      />
      <Feature
        eyebrow="knowledge graph"
        title="Your understanding, laid out typographically."
        body="Concepts are their labels — mastery shows in the weight (regular / light / dimmed). 1px curved edges, canvas-rendered for 60fps on 500+ nodes. Filter by paper, session, mastery. Click a node to open a side panel showing where it came from and what the agent has asked you about it."
        shot={<ShotGraph />}
        reverse
      />
      <Feature
        eyebrow="sessions"
        title="Tabular, sortable, real numbers."
        body="One row per reading session. Columns for date, paper, time spent, concepts surfaced, gaps closed, and a sparkline of understanding trajectory. Monospace numerals, tabular figures, sort by any column. Cmd-K to jump to a session."
        shot={<ShotDashboard />}
      />

      {/* Footer — single row */}
      <footer className="mt-24 flex items-center justify-between border-t border-border px-8 py-6 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        <span>paper-mind · 2026</span>
        <span>built by anish nambirajan</span>
      </footer>
    </div>
  );
}

/* ── Live demo: a mini force-directed graph with real concepts ──────── */

type DemoNode = { id: string; label: string; mastery: "solid" | "shaky" | "gap"; x: number; y: number; vx: number; vy: number };
const DEMO_NODES: Omit<DemoNode, "x" | "y" | "vx" | "vy">[] = [
  { id: "diff",  label: "diffusion",          mastery: "solid" },
  { id: "fm",    label: "flow matching",      mastery: "gap" },
  { id: "og",    label: "one-gen",            mastery: "shaky" },
  { id: "ddpm",  label: "DDPM",               mastery: "solid" },
  { id: "vs",    label: "variance schedule",  mastery: "shaky" },
  { id: "cfg",   label: "CFG",                mastery: "shaky" },
  { id: "unet",  label: "U-Net",              mastery: "solid" },
  { id: "attn",  label: "attention",          mastery: "solid" },
  { id: "sm",    label: "score matching",     mastery: "shaky" },
  { id: "gauss", label: "gaussian noise",     mastery: "solid" },
  { id: "mv",    label: "multi-view",         mastery: "gap" },
  { id: "pose",  label: "camera pose",        mastery: "gap" },
  { id: "text",  label: "CLIP encoder",       mastery: "shaky" },
  { id: "depth", label: "depth estimation",   mastery: "shaky" },
];
const DEMO_EDGES: Array<[string, string]> = [
  ["fm","diff"],["fm","sm"],["diff","ddpm"],["ddpm","vs"],["ddpm","sm"],
  ["cfg","ddpm"],["unet","attn"],["ddpm","unet"],["og","diff"],["og","text"],
  ["text","attn"],["mv","pose"],["mv","og"],["depth","og"],["sm","gauss"],
];

function DemoGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<DemoNode[]>(() =>
    DEMO_NODES.map((n, i) => {
      const angle = (i / DEMO_NODES.length) * Math.PI * 2;
      return { ...n, x: Math.cos(angle) * 160, y: Math.sin(angle) * 120, vx: 0, vy: 0 };
    }),
  );
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  // First-load stagger (one well-orchestrated moment)
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Physics
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const byId = new Map(next.map((n) => [n.id, n]));
        // repulsion
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i], b = next[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) d2 = 1;
            const d = Math.sqrt(d2);
            const f = 3500 / d2;
            a.vx -= (f * dx) / d; a.vy -= (f * dy) / d;
            b.vx += (f * dx) / d; b.vy += (f * dy) / d;
          }
        }
        for (const [s, t] of DEMO_EDGES) {
          const a = byId.get(s), b = byId.get(t);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = 0.03 * (d - 90);
          a.vx += (f * dx) / d; a.vy += (f * dy) / d;
          b.vx -= (f * dx) / d; b.vy -= (f * dy) / d;
        }
        for (const n of next) {
          n.vx += -n.x * 0.004;
          n.vy += -n.y * 0.004;
          n.x += n.vx; n.y += n.vy;
          n.vx *= 0.84; n.vy *= 0.84;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Canvas draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = 620, H = 420;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      const alpha = entered ? 1 : 0;
      ctx.globalAlpha = alpha;

      for (const [s, t] of DEMO_EDGES) {
        const a = nodes.find((n) => n.id === s);
        const b = nodes.find((n) => n.id === t);
        if (!a || !b) continue;
        ctx.beginPath();
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, b.x, b.y);
        ctx.strokeStyle = hoverId && (s === hoverId || t === hoverId)
          ? "rgba(61,123,255,0.55)"
          : "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of nodes) {
        const weight = n.mastery === "solid" ? 500 : n.mastery === "shaky" ? 400 : 300;
        ctx.font = `${weight} 12px "Geist Variable", sans-serif`;
        const dotColor = n.mastery === "gap" ? "#ef4444" : n.mastery === "shaky" ? "#eab308" : "#22c55e";
        const w = ctx.measureText(n.label).width;
        ctx.beginPath();
        ctx.arc(n.x - w / 2 - 7, n.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
        ctx.fillStyle =
          n.mastery === "gap" ? "rgba(180,180,185,0.6)" :
          n.mastery === "shaky" ? "rgba(220,220,225,0.88)" :
          "rgba(236,237,239,1)";
        if (hoverId === n.id) ctx.fillStyle = "rgba(236,237,239,1)";
        ctx.fillText(n.label, n.x, n.y);
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, hoverId, entered]);

  // Hover pick
  const onMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - 310;
    const y = e.clientY - rect.top - 210;
    let hit: string | null = null;
    const ctx = canvasRef.current!.getContext("2d")!;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      ctx.font = `500 12px "Geist Variable", sans-serif`;
      const w = ctx.measureText(n.label).width;
      if (Math.abs(x - n.x) <= w / 2 + 8 && Math.abs(y - n.y) <= 9) {
        hit = n.id;
        break;
      }
    }
    setHoverId(hit);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-border bg-bg-elevated",
        "transition-opacity duration-[400ms] ease-smooth",
        entered ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
        <span className="inline-block h-1 w-1 rounded-full bg-accent" />
        live · diffusion-models mini graph
      </div>
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> solid
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" /> shaky
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" /> gap
        </span>
      </div>
      <div
        onPointerMove={onMove}
        onPointerLeave={() => setHoverId(null)}
        style={{ cursor: hoverId ? "pointer" : "default" }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

/* ── Feature row ──────────────────────────────────────────────────── */

function Feature({
  eyebrow,
  title,
  body,
  shot,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  shot: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="border-t border-border">
      <div
        className={cn(
          "mx-auto grid max-w-[1200px] grid-cols-5 gap-16 px-8 py-20",
        )}
      >
        <div className={cn("col-span-2 flex flex-col justify-center", reverse && "order-2")}>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
            {eyebrow}
          </div>
          <h2 className="text-xl font-medium tracking-display text-fg">{title}</h2>
          <p className="mt-4 max-w-[46ch] text-sm leading-body text-fg-muted">
            {body}
          </p>
        </div>
        <div className={cn("col-span-3", reverse && "order-1")}>
          <div className="overflow-hidden rounded-md border border-border bg-bg-elevated">
            {shot}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Reduced-fidelity "screenshots" — real composed components, not images */

function ShotReader() {
  return (
    <div className="h-[360px] overflow-hidden font-sans text-xs">
      <div className="flex h-8 items-center gap-2 border-b border-border bg-bg px-3">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="text-fg-muted">OneDiffusion · p5 / 14</span>
        <Badge>reading</Badge>
      </div>
      <div className="grid h-[328px] grid-cols-[1fr,280px]">
        <div className="overflow-hidden bg-bg px-6 py-4">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-caps text-fg-muted">
            §3.2 · one-gen training procedure
          </div>
          <p className="text-[11px] leading-[1.6] text-fg-default">
            OneDiffusion is trained on a unified corpus we call{" "}
            <span className="border-b border-dashed border-warning">One-Gen</span>, a
            merged corpus that treats every task as a sequence of structured views. The
            model is trained with a single{" "}
            <span className="border-b border-dashed border-danger">flow matching</span>{" "}
            objective, absorbing both diffusion and score-based regimes into one loss.
          </p>
          <p className="mt-2 text-[11px] leading-[1.6] text-fg-default">
            Unlike prior task-specific models, conditioning is not fed through a separate
            encoder…
          </p>
        </div>
        <div className="border-l border-border bg-bg px-3 py-3 text-[10px]">
          <div className="mb-2 flex items-center justify-between font-mono uppercase tracking-caps text-fg-subtle">
            <span>agent · trace</span>
            <Badge dot tone="success">live</Badge>
          </div>
          <div className="space-y-1.5">
            <TraceLine kind="thought" text="User on §3.2; 'One-Gen' is a concept." />
            <TraceLine kind="action"  text="find_prerequisite_gaps('One-Gen')" />
            <TraceLine kind="obs"     text="2 gaps · flow matching, CFG" />
            <TraceLine kind="action"  text="search_paper('One-Gen corpus')" />
            <TraceLine kind="thought" text="Brief flow matching, then define." />
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceLine({ kind, text }: { kind: "thought" | "action" | "obs"; text: string }) {
  const map = {
    thought: { color: "text-fg-muted", label: "thought" },
    action:  { color: "text-accent",   label: "action"  },
    obs:     { color: "text-success",  label: "obs"     },
  };
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn("font-mono text-[9px] uppercase tracking-caps", map[kind].color)}>
        {map[kind].label}
      </span>
      <span className="truncate text-[10px] text-fg-default">{text}</span>
    </div>
  );
}

function ShotGraph() {
  return (
    <div className="flex h-[360px] items-center justify-center bg-bg">
      <div className="font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        open /#graph for the live canvas →
      </div>
    </div>
  );
}

function ShotDashboard() {
  const rows = [
    ["Apr 19", "OneDiffusion",  "42m",  "8",  "2"],
    ["Apr 17", "OneDiffusion",  "28m",  "5",  "3"],
    ["Apr 15", "DDPM",          "61m",  "14", "1"],
    ["Apr 10", "Song et al.",   "14m",  "3",  "5"],
  ];
  return (
    <div className="bg-bg p-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left font-mono text-[9px] uppercase tracking-caps text-fg-subtle">
            <th className="py-1.5">Date</th>
            <th>Paper</th>
            <th className="text-right">Time</th>
            <th className="text-right">Concepts</th>
            <th className="text-right">Gaps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="py-1.5 font-mono text-fg-muted">{r[0]}</td>
              <td className="text-fg-default">{r[1]}</td>
              <td className="text-right font-mono">{r[2]}</td>
              <td className="text-right font-mono">{r[3]}</td>
              <td className="text-right font-mono text-warning">{r[4]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Filter, Search, X } from "lucide-react";
import { cn } from "../util";
import { Badge, Button, Card, CardBody, Input, Kbd, Select } from "../primitives";

/* ────────────────────────────────────────────────────────────────────
   Knowledge graph — typographic nodes, canvas-rendered, 60fps.
   Nodes ARE their labels (weight = mastery). Edges are 1px curves.
   Real physics, drag/pan/zoom, arrow-key navigation, side panel on select.
   ──────────────────────────────────────────────────────────────────── */

type Mastery = "solid" | "shaky" | "gap";

interface Node {
  id: string;
  label: string;
  mastery: Mastery;
  paper: string;
  session: string;
  introduced: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

interface Edge {
  source: string;
  target: string;
}

const SEED: { nodes: Omit<Node, "x" | "y" | "vx" | "vy" | "pinned">[]; edges: Edge[] } = {
  nodes: [
    { id: "diffusion",           label: "diffusion models",        mastery: "solid",  paper: "OneDiffusion",  session: "Apr 17", introduced: "§1 intro" },
    { id: "flow-matching",       label: "flow matching",           mastery: "gap",    paper: "OneDiffusion",  session: "Apr 19", introduced: "§3.2 p5" },
    { id: "one-gen",             label: "One-Gen corpus",          mastery: "shaky",  paper: "OneDiffusion",  session: "Apr 19", introduced: "§3.2 p5" },
    { id: "ddpm",                label: "DDPM",                    mastery: "solid",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3 method" },
    { id: "score-matching",      label: "denoising score matching",mastery: "shaky",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3" },
    { id: "variance-schedule",   label: "variance schedule",       mastery: "shaky",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3.1" },
    { id: "gaussian-noise",      label: "gaussian noise",          mastery: "solid",  paper: "prerequisite",  session: "—",      introduced: "prerequisite" },
    { id: "unet",                label: "U-Net",                   mastery: "solid",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3.3" },
    { id: "cfg",                 label: "classifier-free guidance",mastery: "shaky",  paper: "Ho et al.",     session: "Apr 15", introduced: "§5 sampling" },
    { id: "attention",           label: "attention",               mastery: "solid",  paper: "prerequisite",  session: "—",      introduced: "prerequisite" },
    { id: "text-encoder",        label: "text encoder (CLIP)",     mastery: "shaky",  paper: "OneDiffusion",  session: "Apr 19", introduced: "§2" },
    { id: "multiview",           label: "multi-view synthesis",    mastery: "gap",    paper: "OneDiffusion",  session: "Apr 19", introduced: "§4.2" },
    { id: "camera-pose",         label: "camera pose conditioning",mastery: "gap",    paper: "OneDiffusion",  session: "Apr 19", introduced: "§4.2" },
    { id: "depth",               label: "depth estimation",        mastery: "shaky",  paper: "OneDiffusion",  session: "Apr 19", introduced: "§4.1" },
    { id: "segmentation",        label: "semantic segmentation",   mastery: "shaky",  paper: "OneDiffusion",  session: "Apr 19", introduced: "§4.1" },
    { id: "reverse-process",     label: "reverse process",         mastery: "solid",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3" },
    { id: "forward-process",     label: "forward process",         mastery: "solid",  paper: "Ho et al.",     session: "Apr 15", introduced: "§3" },
    { id: "score-function",      label: "score function",          mastery: "shaky",  paper: "Song et al.",   session: "Apr 10", introduced: "§2" },
    { id: "sde",                 label: "stochastic differential eqs", mastery: "gap",paper: "Song et al.", session: "Apr 10", introduced: "§3" },
  ],
  edges: [
    { source: "flow-matching",     target: "diffusion" },
    { source: "flow-matching",     target: "score-matching" },
    { source: "diffusion",         target: "ddpm" },
    { source: "ddpm",              target: "score-matching" },
    { source: "ddpm",              target: "forward-process" },
    { source: "ddpm",              target: "reverse-process" },
    { source: "ddpm",              target: "variance-schedule" },
    { source: "forward-process",   target: "gaussian-noise" },
    { source: "reverse-process",   target: "unet" },
    { source: "unet",              target: "attention" },
    { source: "one-gen",           target: "diffusion" },
    { source: "one-gen",           target: "text-encoder" },
    { source: "text-encoder",      target: "attention" },
    { source: "cfg",               target: "ddpm" },
    { source: "multiview",         target: "camera-pose" },
    { source: "multiview",         target: "one-gen" },
    { source: "depth",             target: "one-gen" },
    { source: "segmentation",      target: "one-gen" },
    { source: "score-matching",    target: "score-function" },
    { source: "score-function",    target: "sde" },
  ],
};

const MASTERY_COLOR: Record<Mastery, string> = {
  solid: "var(--success)",
  shaky: "var(--warning)",
  gap:   "var(--danger)",
};

export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>(() => {
    const n = SEED.nodes.length;
    return SEED.nodes.map((s, i) => {
      const angle = (i / n) * Math.PI * 2;
      return { ...s, x: Math.cos(angle) * 280, y: Math.sin(angle) * 280, vx: 0, vy: 0, pinned: false };
    });
  });
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<Mastery>>(new Set(["solid", "shaky", "gap"]));
  const [query, setQuery] = useState("");
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const dragRef = useRef<{ mode: "none" | "node" | "pan"; id?: string; startX: number; startY: number; camX: number; camY: number }>({
    mode: "none", startX: 0, startY: 0, camX: 0, camY: 0,
  });

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Physics simulation
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setNodes((prev) => {
        const next = prev.map((n) => ({ ...n }));
        const byId = new Map(next.map((n) => [n.id, n]));

        // Repulsion
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i], b = next[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) d2 = 1;
            const d = Math.sqrt(d2);
            const f = 14000 / d2;
            const fx = (f * dx) / d, fy = (f * dy) / d;
            if (!a.pinned) { a.vx -= fx; a.vy -= fy; }
            if (!b.pinned) { b.vx += fx; b.vy += fy; }
          }
        }
        // Springs
        for (const e of SEED.edges) {
          const a = byId.get(e.source), b = byId.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = 0.025 * (d - 150);
          const fx = (f * dx) / d, fy = (f * dy) / d;
          if (!a.pinned) { a.vx += fx; a.vy += fy; }
          if (!b.pinned) { b.vx -= fx; b.vy -= fy; }
        }
        // Damping + integration
        for (const n of next) {
          if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
          n.x += n.vx; n.y += n.vy;
          n.vx *= 0.82; n.vy *= 0.82;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Matched set for dim-out
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySearch = q
      ? new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id))
      : null;
    const byFilter = new Set(nodes.filter((n) => filter.has(n.mastery)).map((n) => n.id));
    if (bySearch) {
      const inter = new Set<string>();
      bySearch.forEach((id) => byFilter.has(id) && inter.add(id));
      return inter;
    }
    return byFilter;
  }, [nodes, query, filter]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const neighborIds = useMemo(() => {
    const active = selectedId ?? hoverId;
    if (!active) return null;
    const s = new Set<string>([active]);
    for (const e of SEED.edges) {
      if (e.source === active) s.add(e.target);
      if (e.target === active) s.add(e.source);
    }
    return s;
  }, [selectedId, hoverId]);

  // Canvas render loop — decoupled from React for 60fps
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, dims.w, dims.h);
      ctx.save();
      ctx.translate(dims.w / 2 + camera.x, dims.h / 2 + camera.y);
      ctx.scale(camera.z, camera.z);

      // Edges first
      for (const e of SEED.edges) {
        const a = nodes.find((n) => n.id === e.source);
        const b = nodes.find((n) => n.id === e.target);
        if (!a || !b) continue;
        const active =
          !neighborIds ||
          (neighborIds.has(a.id) && neighborIds.has(b.id));
        ctx.beginPath();
        // Curved edge for visual interest
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const nx = -dy * 0.08;
        const ny =  dx * 0.08;
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx + nx, my + ny, b.x, b.y);
        ctx.strokeStyle = active
          ? "rgba(255,255,255,0.28)"
          : "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1 / camera.z;
        ctx.stroke();
      }

      // Nodes — typographic (label IS the node)
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const n of nodes) {
        const inMatch = matched.has(n.id);
        const inNeighbor = !neighborIds || neighborIds.has(n.id);
        const visible = inMatch && inNeighbor;
        const isSel = n.id === selectedId;
        const isHover = n.id === hoverId;

        ctx.save();
        ctx.globalAlpha = visible ? 1 : 0.12;

        // Weight indicates mastery
        const weight =
          n.mastery === "solid" ? 500 :
          n.mastery === "shaky" ? 400 : 300;
        const size = isSel ? 16 : 13;
        ctx.font = `${weight} ${size}px "Geist Variable", sans-serif`;

        // Subtle halo for selected / hover
        if (isSel || isHover) {
          const mw = ctx.measureText(n.label).width;
          ctx.fillStyle = isSel ? "var(--accent-soft)" : "rgba(255,255,255,0.04)";
          // approximate accent-soft
          ctx.fillStyle = isSel ? "rgba(61,123,255,0.12)" : "rgba(255,255,255,0.05)";
          ctx.beginPath();
          const padX = 10, padY = 6, rad = 4;
          roundRect(ctx, n.x - mw / 2 - padX, n.y - size / 2 - padY, mw + padX * 2, size + padY * 2, rad);
          ctx.fill();
        }

        // Dot + text
        const dotX = n.x - ctx.measureText(n.label).width / 2 - 8;
        ctx.beginPath();
        ctx.arc(dotX, n.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = MASTERY_COLOR[n.mastery];
        ctx.fill();

        ctx.fillStyle = n.mastery === "gap" ? "var(--fg-subtle)" : "var(--fg-default)";
        ctx.fillStyle =
          n.mastery === "gap" ? "rgba(180,180,185,0.65)" :
          n.mastery === "shaky" ? "rgba(220,220,225,0.88)" :
          "rgba(236,237,239,1)";
        if (isSel) ctx.fillStyle = "rgba(236,237,239,1)";
        ctx.fillText(n.label, n.x, n.y);

        ctx.restore();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, dims, camera, selectedId, hoverId, neighborIds, matched]);

  // Camera ease-to on select
  useEffect(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return;
    const targetX = -n.x * camera.z;
    const targetY = -n.y * camera.z;
    const startX = camera.x, startY = camera.y;
    const dur = 320;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out
      setCamera((c) => ({
        ...c,
        x: startX + (targetX - startX) * e,
        y: startY + (targetY - startY) * e,
      }));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Only trigger on selection change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Pointer handlers — hit-test nodes via label bbox
  const pickNode = (px: number, py: number): Node | null => {
    const wx = (px - dims.w / 2 - camera.x) / camera.z;
    const wy = (py - dims.h / 2 - camera.y) / camera.z;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d")!;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      ctx.font = `500 13px "Geist Variable", sans-serif`;
      const w = ctx.measureText(n.label).width;
      const h = 18;
      if (wx >= n.x - w / 2 - 10 && wx <= n.x + w / 2 + 10 && wy >= n.y - h / 2 && wy <= n.y + h / 2) {
        return n;
      }
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = pickNode(x, y);
    if (hit) {
      setNodes((prev) => prev.map((n) => (n.id === hit.id ? { ...n, pinned: true } : n)));
      dragRef.current = { mode: "node", id: hit.id, startX: x, startY: y, camX: 0, camY: 0 };
    } else {
      dragRef.current = { mode: "pan", startX: x, startY: y, camX: camera.x, camY: camera.y };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const d = dragRef.current;
    if (d.mode === "node" && d.id) {
      const wx = (x - dims.w / 2 - camera.x) / camera.z;
      const wy = (y - dims.h / 2 - camera.y) / camera.z;
      setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, x: wx, y: wy } : n)));
    } else if (d.mode === "pan") {
      setCamera((c) => ({ ...c, x: d.camX + (x - d.startX), y: d.camY + (y - d.startY) }));
    } else {
      const hit = pickNode(x, y);
      setHoverId(hit?.id ?? null);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const moved = Math.hypot(x - d.startX, y - d.startY) > 4;
    if (d.mode === "node" && d.id) {
      setNodes((prev) => prev.map((n) => (n.id === d.id ? { ...n, pinned: false } : n)));
      if (!moved) setSelectedId(d.id);
    } else if (d.mode === "pan" && !moved) {
      setSelectedId(null);
    }
    dragRef.current = { mode: "none", startX: 0, startY: 0, camX: 0, camY: 0 };
  };
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCamera((c) => {
      const f = Math.exp(-e.deltaY * 0.001);
      return { ...c, z: Math.max(0.35, Math.min(2.5, c.z * f)) };
    });
  };

  const toggleFilter = (m: Mastery) =>
    setFilter((f) => {
      const n = new Set(f);
      n.has(m) ? n.delete(m) : n.add(m);
      return n.size === 0 ? new Set(["solid", "shaky", "gap"]) : n;
    });

  const counts = useMemo(() => {
    const c = { solid: 0, shaky: 0, gap: 0 };
    for (const n of nodes) c[n.mastery]++;
    return c;
  }, [nodes]);

  return (
    <div className="ds-root flex h-screen flex-col bg-bg" data-theme="dark">
      {/* Top filter bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-elevated px-4">
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2 text-sm font-medium text-fg hover:text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" />
            paper-mind
          </a>
          <span className="text-fg-subtle">/</span>
          <span className="text-sm text-fg-default">knowledge graph</span>
          <Badge>{nodes.length} concepts</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter concepts…"
            leadingIcon={<Search size={13} strokeWidth={1.5} />}
            trailingIcon={query ? undefined : <Kbd keys="/" size="sm" />}
            className="w-64"
          />
          <Select size="sm" defaultValue="all">
            <option value="all">All papers</option>
            <option value="od">OneDiffusion</option>
            <option value="ddpm">DDPM</option>
            <option value="song">Song et al.</option>
          </Select>
          <Select size="sm" defaultValue="all">
            <option value="all">All sessions</option>
            <option value="w">This week</option>
            <option value="m">This month</option>
          </Select>
          <div className="mx-1 h-5 w-px bg-border" />
          <FilterChip mastery="solid" active={filter.has("solid")} count={counts.solid} onClick={() => toggleFilter("solid")} />
          <FilterChip mastery="shaky" active={filter.has("shaky")} count={counts.shaky} onClick={() => toggleFilter("shaky")} />
          <FilterChip mastery="gap"   active={filter.has("gap")}   count={counts.gap}   onClick={() => toggleFilter("gap")} />
        </div>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{ cursor: hoverId ? "pointer" : "grab" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className="block" />
        </div>

        {/* Tip chip bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
          <Kbd keys="click" size="sm" /> select
          <Kbd keys="drag" size="sm" /> move
          <Kbd keys="scroll" size="sm" /> zoom
          <Kbd keys="/" size="sm" /> search
        </div>

        {/* Detail side panel */}
        {selected && (
          <aside
            className={cn(
              "absolute right-4 top-4 w-[340px]",
              "animate-[ds-pop-in_var(--dur-base)_var(--ease-out)]",
            )}
          >
            <Card bare>
              <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  <Badge
                    tone={selected.mastery === "gap" ? "danger" : selected.mastery === "shaky" ? "warning" : "success"}
                    dot
                  >
                    {selected.mastery}
                  </Badge>
                  <h3 className="mt-2 text-sm font-medium text-fg">{selected.label}</h3>
                  <p className="mt-1 text-xs text-fg-muted">
                    {selected.paper} · {selected.introduced}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-sm p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
                  aria-label="Close"
                >
                  <X size={13} strokeWidth={1.5} />
                </button>
              </header>
              <CardBody>
                <ConfidenceBar mastery={selected.mastery} />
                <div className="mt-4 space-y-3">
                  <MetaRow label="First seen" value={`${selected.paper} · ${selected.introduced}`} />
                  <MetaRow label="In session" value={selected.session} />
                  <MetaRow label="Agent touched" value="3 queries · last 16m ago" />
                </div>

                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                    Depends on
                  </div>
                  <div className="space-y-1">
                    {SEED.edges
                      .filter((e) => e.source === selected.id)
                      .map((e) => {
                        const n = nodes.find((x) => x.id === e.target);
                        if (!n) return null;
                        return (
                          <button
                            key={e.target}
                            onClick={() => setSelectedId(n.id)}
                            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-fg-default hover:bg-bg-hover"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: MASTERY_COLOR[n.mastery] }}
                              />
                              {n.label}
                            </span>
                            <ArrowUpRight size={11} strokeWidth={1.5} className="text-fg-subtle" />
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                    Used by
                  </div>
                  <div className="space-y-1">
                    {SEED.edges
                      .filter((e) => e.target === selected.id)
                      .map((e) => {
                        const n = nodes.find((x) => x.id === e.source);
                        if (!n) return null;
                        return (
                          <button
                            key={e.source}
                            onClick={() => setSelectedId(n.id)}
                            className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-fg-default hover:bg-bg-hover"
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: MASTERY_COLOR[n.mastery] }}
                              />
                              {n.label}
                            </span>
                            <ArrowUpRight size={11} strokeWidth={1.5} className="text-fg-subtle" />
                          </button>
                        );
                      })}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                  <Button size="sm" variant="primary">Open in reader</Button>
                  <Button size="sm" variant="ghost">Mark as solid</Button>
                </div>
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  mastery,
  active,
  count,
  onClick,
}: { mastery: Mastery; active: boolean; count: number; onClick: () => void }) {
  const tone: "success" | "warning" | "danger" =
    mastery === "gap" ? "danger" : mastery === "shaky" ? "warning" : "success";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-1",
        "font-mono text-[10px] uppercase tracking-caps",
        "transition-colors duration-quick ease-smooth",
        active
          ? `border-[color:var(--${tone === "success" ? "success" : tone === "warning" ? "warning" : "danger"})]/50 bg-[color:var(--${tone === "success" ? "success" : tone === "warning" ? "warning" : "danger"})]/10 text-fg`
          : "border-border text-fg-muted hover:bg-bg-hover",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: MASTERY_COLOR[mastery] }} />
      {mastery}
      <span className="text-fg-subtle">{count}</span>
    </button>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="font-mono uppercase tracking-caps text-fg-subtle">{label}</span>
      <span className="text-right text-fg-default">{value}</span>
    </div>
  );
}

function ConfidenceBar({ mastery }: { mastery: Mastery }) {
  const pct = mastery === "solid" ? 78 : mastery === "shaky" ? 41 : 12;
  return (
    <div>
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        <span>confidence</span>
        <span className="text-fg-default">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-bg-raised">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: MASTERY_COLOR[mastery],
            transition: "width var(--dur-view) var(--ease-out)",
          }}
        />
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

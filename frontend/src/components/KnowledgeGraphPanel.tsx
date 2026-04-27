import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw, Search, X } from "lucide-react";
import { cn } from "../design-system/util";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Input,
  Kbd,
} from "../design-system/primitives";
import { getKnowledgeGraph } from "../api";

type Mastery = "solid" | "shaky" | "gap";

interface ApiNode {
  id: string;
  confidence: number;
  source: string;
}

interface ApiLink {
  source: string;
  target: string;
}

interface SimNode extends ApiNode {
  mastery: Mastery;
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

const MASTERY_COLOR: Record<Mastery, string> = {
  solid: "#22c55e",
  shaky: "#eab308",
  gap:   "#ef4444",
};

function toMastery(confidence: number): Mastery {
  if (confidence >= 0.66) return "solid";
  if (confidence >= 0.33) return "shaky";
  return "gap";
}

/** Placeholder shown while the real graph is empty — gives the panel life. */
const PLACEHOLDER: { nodes: ApiNode[]; links: ApiLink[] } = {
  nodes: [
    { id: "diffusion models",     confidence: 0.75, source: "prerequisite" },
    { id: "denoising",            confidence: 0.55, source: "OneDiffusion, p3" },
    { id: "forward process",      confidence: 0.48, source: "OneDiffusion, p3" },
    { id: "reverse process",      confidence: 0.38, source: "OneDiffusion, p3" },
    { id: "text-to-image",        confidence: 0.62, source: "OneDiffusion, p1" },
    { id: "gaussian noise",       confidence: 0.82, source: "prerequisite" },
    { id: "neural networks",      confidence: 0.90, source: "prerequisite" },
    { id: "U-Net",                confidence: 0.44, source: "prerequisite" },
    { id: "attention",            confidence: 0.55, source: "prerequisite" },
    { id: "embeddings",           confidence: 0.60, source: "prerequisite" },
  ],
  links: [
    { source: "diffusion models",  target: "denoising" },
    { source: "denoising",          target: "forward process" },
    { source: "denoising",          target: "reverse process" },
    { source: "forward process",    target: "gaussian noise" },
    { source: "reverse process",    target: "neural networks" },
    { source: "reverse process",    target: "U-Net" },
    { source: "U-Net",              target: "neural networks" },
    { source: "text-to-image",      target: "diffusion models" },
    { source: "text-to-image",      target: "embeddings" },
    { source: "text-to-image",      target: "attention" },
    { source: "attention",          target: "neural networks" },
  ],
};

export default function KnowledgeGraphPanel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<ApiLink[]>([]);
  const [camera, setCamera] = useState({ x: 0, y: 0, z: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Set<Mastery>>(
    new Set(["solid", "shaky", "gap"]),
  );
  const [query, setQuery] = useState("");
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [loading, setLoading] = useState(false);
  const [isPlaceholder, setIsPlaceholder] = useState(false);
  const [pageLast, setPageLast] = useState<number>(Date.now());
  const dragRef = useRef<{
    mode: "none" | "node" | "pan";
    id?: string;
    startX: number;
    startY: number;
    camX: number;
    camY: number;
  }>({ mode: "none", startX: 0, startY: 0, camX: 0, camY: 0 });

  // Measure container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load graph — real first, placeholder if empty
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKnowledgeGraph();
      const src =
        data.nodes && data.nodes.length > 0
          ? { nodes: data.nodes, links: data.links || [] }
          : PLACEHOLDER;
      setIsPlaceholder(data.nodes?.length ? false : true);
      const n = src.nodes.length;
      setNodes(
        src.nodes.map((nn: ApiNode, i: number) => {
          const angle = (i / Math.max(n, 1)) * Math.PI * 2;
          return {
            ...nn,
            mastery: toMastery(nn.confidence),
            x: Math.cos(angle) * 240,
            y: Math.sin(angle) * 240,
            vx: 0,
            vy: 0,
            pinned: false,
          };
        }),
      );
      setEdges(src.links);
      setPageLast(Date.now());
    } catch {
      const n = PLACEHOLDER.nodes.length;
      setNodes(
        PLACEHOLDER.nodes.map((nn, i) => {
          const angle = (i / n) * Math.PI * 2;
          return {
            ...nn,
            mastery: toMastery(nn.confidence),
            x: Math.cos(angle) * 240,
            y: Math.sin(angle) * 240,
            vx: 0,
            vy: 0,
            pinned: false,
          };
        }),
      );
      setEdges(PLACEHOLDER.links);
      setIsPlaceholder(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Physics
  useEffect(() => {
    if (nodes.length === 0) return;
    let raf = 0;
    const tick = () => {
      setNodes((prev) => {
        if (prev.length === 0) return prev;
        const next = prev.map((n) => ({ ...n }));
        const byId = new Map(next.map((n) => [n.id, n]));
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i], b = next[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) d2 = 1;
            const d = Math.sqrt(d2);
            const f = 12000 / d2;
            if (!a.pinned) { a.vx -= (f * dx) / d; a.vy -= (f * dy) / d; }
            if (!b.pinned) { b.vx += (f * dx) / d; b.vy += (f * dy) / d; }
          }
        }
        for (const e of edges) {
          const a = byId.get(e.source), b = byId.get(e.target);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = 0.025 * (d - 130);
          if (!a.pinned) { a.vx += (f * dx) / d; a.vy += (f * dy) / d; }
          if (!b.pinned) { b.vx -= (f * dx) / d; b.vy -= (f * dy) / d; }
        }
        for (const n of next) {
          if (n.pinned) { n.vx = 0; n.vy = 0; continue; }
          n.vx += -n.x * 0.002;
          n.vy += -n.y * 0.002;
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= 0.82;
          n.vy *= 0.82;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [edges, nodes.length, pageLast]);

  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySearch = q
      ? new Set(
          nodes.filter((n) => n.id.toLowerCase().includes(q)).map((n) => n.id),
        )
      : null;
    const byFilter = new Set(
      nodes.filter((n) => filter.has(n.mastery)).map((n) => n.id),
    );
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
    for (const e of edges) {
      if (e.source === active) s.add(e.target);
      if (e.target === active) s.add(e.source);
    }
    return s;
  }, [selectedId, hoverId, edges]);

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, dims.w, dims.h);
      ctx.save();
      ctx.translate(dims.w / 2 + camera.x, dims.h / 2 + camera.y);
      ctx.scale(camera.z, camera.z);

      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.source);
        const b = nodes.find((n) => n.id === e.target);
        if (!a || !b) continue;
        const active =
          !neighborIds ||
          (neighborIds.has(a.id) && neighborIds.has(b.id));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, b.x, b.y);
        ctx.strokeStyle = active
          ? "rgba(255,255,255,0.28)"
          : "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1 / camera.z;
        ctx.stroke();
      }

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

        const weight =
          n.mastery === "solid" ? 500 : n.mastery === "shaky" ? 400 : 300;
        const size = isSel ? 15 : 13;
        ctx.font = `${weight} ${size}px "Geist Variable", sans-serif`;

        const w = ctx.measureText(n.id).width;
        if (isSel || isHover) {
          ctx.fillStyle = isSel ? "rgba(61,123,255,0.14)" : "rgba(255,255,255,0.05)";
          const pad = 8;
          roundRect(ctx, n.x - w / 2 - pad, n.y - size / 2 - 5, w + pad * 2, size + 10, 4);
          ctx.fill();
        }

        // Mastery dot
        ctx.beginPath();
        ctx.arc(n.x - w / 2 - 8, n.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = MASTERY_COLOR[n.mastery];
        ctx.fill();

        // Label
        ctx.fillStyle =
          n.mastery === "gap" ? "rgba(180,180,185,0.65)" :
          n.mastery === "shaky" ? "rgba(220,220,225,0.88)" :
          "rgba(236,237,239,1)";
        if (isSel) ctx.fillStyle = "rgba(236,237,239,1)";
        ctx.fillText(n.id, n.x, n.y);
        ctx.restore();
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, dims, camera, selectedId, hoverId, neighborIds, matched]);

  // Ease camera to selected
  useEffect(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return;
    const targetX = -n.x * camera.z;
    const targetY = -n.y * camera.z;
    const startX = camera.x, startY = camera.y;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 320);
      const e = 1 - Math.pow(1 - p, 3);
      setCamera((c) => ({
        ...c,
        x: startX + (targetX - startX) * e,
        y: startY + (targetY - startY) * e,
      }));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const pickNode = (px: number, py: number): SimNode | null => {
    const wx = (px - dims.w / 2 - camera.x) / camera.z;
    const wy = (py - dims.h / 2 - camera.y) / camera.z;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d")!;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      ctx.font = `500 13px "Geist Variable", sans-serif`;
      const w = ctx.measureText(n.id).width;
      if (
        wx >= n.x - w / 2 - 10 &&
        wx <= n.x + w / 2 + 10 &&
        wy >= n.y - 10 &&
        wy <= n.y + 10
      ) {
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
      setNodes((prev) =>
        prev.map((n) => (n.id === hit.id ? { ...n, pinned: true } : n)),
      );
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
      setNodes((prev) =>
        prev.map((n) => (n.id === d.id ? { ...n, x: wx, y: wy } : n)),
      );
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
      setNodes((prev) =>
        prev.map((n) => (n.id === d.id ? { ...n, pinned: false } : n)),
      );
      if (!moved) setSelectedId(d.id);
    } else if (d.mode === "pan" && !moved) {
      setSelectedId(null);
    }
    dragRef.current = { mode: "none", startX: 0, startY: 0, camX: 0, camY: 0 };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCamera((c) => ({
      ...c,
      z: Math.max(0.35, Math.min(2.5, c.z * Math.exp(-e.deltaY * 0.001))),
    }));
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
    <div className="relative flex h-full w-full flex-col bg-bg">
      {/* Toolbar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-elevated px-4">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-caps text-fg-muted">
            knowledge graph
          </span>
          <Badge>
            {nodes.length} concept{nodes.length === 1 ? "" : "s"}
          </Badge>
          {isPlaceholder && (
            <Badge tone="accent" variant="outline">
              placeholder
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter concepts…"
            leadingIcon={<Search size={13} strokeWidth={1.5} />}
            className="w-56"
          />
          <div className="mx-1 h-5 w-px bg-border" />
          <FilterChip
            mastery="solid"
            active={filter.has("solid")}
            count={counts.solid}
            onClick={() => toggleFilter("solid")}
          />
          <FilterChip
            mastery="shaky"
            active={filter.has("shaky")}
            count={counts.shaky}
            onClick={() => toggleFilter("shaky")}
          />
          <FilterChip
            mastery="gap"
            active={filter.has("gap")}
            count={counts.gap}
            onClick={() => toggleFilter("gap")}
          />
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            size="sm"
            variant="ghost"
            onClick={load}
            disabled={loading}
            leadingIcon={<RefreshCw size={13} strokeWidth={1.5} />}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
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

        {/* Tip chip */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-caps text-fg-muted">
          <Kbd keys="click" size="sm" /> select
          <Kbd keys="drag" size="sm" /> move
          <Kbd keys="scroll" size="sm" /> zoom
        </div>

        {/* Detail side panel */}
        {selected && (
          <aside
            className={cn(
              "absolute right-3 top-3 w-[320px]",
              "animate-[ds-pop-in_var(--dur-base)_var(--ease-out)]",
            )}
          >
            <Card bare>
              <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <Badge
                    tone={
                      selected.mastery === "gap"
                        ? "danger"
                        : selected.mastery === "shaky"
                          ? "warning"
                          : "success"
                    }
                    dot
                  >
                    {selected.mastery} · {(selected.confidence * 100).toFixed(0)}%
                  </Badge>
                  <h3 className="mt-2 text-sm font-medium text-fg">
                    {selected.id}
                  </h3>
                  {selected.source && (
                    <p className="mt-1 text-xs text-fg-muted">{selected.source}</p>
                  )}
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
                <div className="mb-4">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                    <span>confidence</span>
                    <span className="text-fg-default">
                      {(selected.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-bg-raised">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${selected.confidence * 100}%`,
                        background: MASTERY_COLOR[selected.mastery],
                        transition: "width var(--dur-view) var(--ease-out)",
                      }}
                    />
                  </div>
                </div>

                <RelationList
                  label="Depends on"
                  ids={edges.filter((e) => e.source === selected.id).map((e) => e.target)}
                  nodes={nodes}
                  onPick={setSelectedId}
                />
                <RelationList
                  label="Used by"
                  ids={edges.filter((e) => e.target === selected.id).map((e) => e.source)}
                  nodes={nodes}
                  onPick={setSelectedId}
                />
              </CardBody>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}

function RelationList({
  label,
  ids,
  nodes,
  onPick,
}: {
  label: string;
  ids: string[];
  nodes: SimNode[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        <span>{label}</span>
        <span>{ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <p className="text-xs text-fg-subtle">—</p>
      ) : (
        <div className="space-y-1">
          {ids.map((id) => {
            const n = nodes.find((x) => x.id === id);
            return (
              <button
                key={id}
                onClick={() => onPick(id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-fg-default",
                  "transition-colors duration-quick ease-smooth hover:bg-bg-hover",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: n ? MASTERY_COLOR[n.mastery] : "#888" }}
                  />
                  {id}
                </span>
                <ArrowUpRight
                  size={11}
                  strokeWidth={1.5}
                  className="text-fg-subtle"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  mastery,
  active,
  count,
  onClick,
}: {
  mastery: Mastery;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const bg =
    mastery === "solid"
      ? "rgba(34,197,94,0.10)"
      : mastery === "shaky"
        ? "rgba(234,179,8,0.10)"
        : "rgba(239,68,68,0.10)";
  const border =
    mastery === "solid"
      ? "rgba(34,197,94,0.5)"
      : mastery === "shaky"
        ? "rgba(234,179,8,0.5)"
        : "rgba(239,68,68,0.5)";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-1",
        "font-mono text-[10px] uppercase tracking-caps",
        "transition-colors duration-quick ease-smooth",
        active ? "text-fg" : "text-fg-muted hover:bg-bg-hover",
      )}
      style={
        active
          ? { background: bg, borderColor: border }
          : { borderColor: "var(--border)" }
      }
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: MASTERY_COLOR[mastery] }}
      />
      {mastery}
      <span className="text-fg-subtle">{count}</span>
    </button>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getKnowledgeGraph } from '../api';
import './KnowledgeGraphPanel.css';

interface KGNode {
  id: string;
  confidence: number;
  source: string;
}

interface KGLink {
  source: string;
  target: string;
}

interface SimNode extends KGNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pinned: boolean;
}

// Placeholder concepts shown when the real graph is empty.
// This lets the user see the visualization working before they've had any
// conversations that build up the real graph.
const PLACEHOLDER: { nodes: KGNode[]; links: KGLink[] } = {
  nodes: [
    { id: 'diffusion models', confidence: 0.7, source: 'OneDiffusion, page 2' },
    { id: 'denoising', confidence: 0.5, source: 'OneDiffusion, page 3' },
    { id: 'forward process', confidence: 0.4, source: 'OneDiffusion, page 3' },
    { id: 'reverse process', confidence: 0.3, source: 'OneDiffusion, page 3' },
    { id: 'text-to-image', confidence: 0.6, source: 'OneDiffusion, page 1' },
    { id: 'gaussian noise', confidence: 0.8, source: 'prerequisite' },
    { id: 'neural networks', confidence: 0.9, source: 'prerequisite' },
    { id: 'UNet architecture', confidence: 0.4, source: 'prerequisite' },
    { id: 'attention', confidence: 0.5, source: 'prerequisite' },
    { id: 'embeddings', confidence: 0.6, source: 'prerequisite' },
  ],
  links: [
    { source: 'diffusion models', target: 'denoising' },
    { source: 'denoising', target: 'forward process' },
    { source: 'denoising', target: 'reverse process' },
    { source: 'forward process', target: 'gaussian noise' },
    { source: 'reverse process', target: 'neural networks' },
    { source: 'reverse process', target: 'UNet architecture' },
    { source: 'UNet architecture', target: 'neural networks' },
    { source: 'text-to-image', target: 'diffusion models' },
    { source: 'text-to-image', target: 'embeddings' },
    { source: 'text-to-image', target: 'attention' },
    { source: 'attention', target: 'neural networks' },
  ],
};

function confidenceColor(c: number): string {
  // Red (low) -> yellow (mid) -> green (high)
  if (c < 0.33) return '#ef4444';
  if (c < 0.66) return '#eab308';
  return '#22c55e';
}

function confidenceLabel(c: number): string {
  if (c < 0.25) return 'gap';
  if (c < 0.5) return 'shaky';
  if (c < 0.75) return 'comfortable';
  return 'solid';
}

export default function KnowledgeGraphPanel() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [rawGraph, setRawGraph] = useState<{ nodes: KGNode[]; links: KGLink[] }>(PLACEHOLDER);
  const [isPlaceholder, setIsPlaceholder] = useState(true);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dragState = useRef<{
    id: string | null;
    offsetX: number;
    offsetY: number;
  }>({ id: null, offsetX: 0, offsetY: 0 });

  // Track container size so layout adapts to panel width
  useEffect(() => {
    if (!svgRef.current?.parentElement) return;
    const el = svgRef.current.parentElement;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch real graph; fall back to placeholder if empty or error
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getKnowledgeGraph();
      if (data.nodes && data.nodes.length > 0) {
        setRawGraph(data);
        setIsPlaceholder(false);
      } else {
        setRawGraph(PLACEHOLDER);
        setIsPlaceholder(true);
      }
    } catch {
      setRawGraph(PLACEHOLDER);
      setIsPlaceholder(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Initialize node positions whenever the graph data changes
  useEffect(() => {
    const cx = dims.w / 2;
    const cy = dims.h / 2;
    const r = Math.min(dims.w, dims.h) * 0.3;
    setNodes(
      rawGraph.nodes.map((n, i) => {
        const angle = (i / Math.max(rawGraph.nodes.length, 1)) * Math.PI * 2;
        return {
          ...n,
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          pinned: false,
        };
      })
    );
  }, [rawGraph, dims.w, dims.h]);

  // Force simulation — runs continuously until roughly at rest
  useEffect(() => {
    if (nodes.length === 0) return;

    let raf = 0;
    const REPULSION = 6000;
    const SPRING = 0.04;
    const REST_LEN = 110;
    const CENTER = 0.005;
    const DAMP = 0.82;

    const tick = () => {
      setNodes((prev) => {
        if (prev.length === 0) return prev;
        const next = prev.map((n) => ({ ...n }));
        const byId = new Map(next.map((n) => [n.id, n]));
        const cx = dims.w / 2;
        const cy = dims.h / 2;

        // Pairwise repulsion (O(n²), fine for small graphs)
        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i];
            const b = next[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) d2 = 1;
            const d = Math.sqrt(d2);
            const f = REPULSION / d2;
            const fx = (f * dx) / d;
            const fy = (f * dy) / d;
            if (!a.pinned) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (!b.pinned) {
              b.vx += fx;
              b.vy += fy;
            }
          }
        }

        // Spring along edges
        for (const link of rawGraph.links) {
          const a = byId.get(link.source);
          const b = byId.get(link.target);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = SPRING * (d - REST_LEN);
          const fx = (f * dx) / d;
          const fy = (f * dy) / d;
          if (!a.pinned) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.pinned) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        // Gravity toward center
        for (const n of next) {
          if (n.pinned) continue;
          n.vx += (cx - n.x) * CENTER;
          n.vy += (cy - n.y) * CENTER;
        }

        // Integrate + damp + clamp to bounds
        for (const n of next) {
          if (n.pinned) {
            n.vx = 0;
            n.vy = 0;
            continue;
          }
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= DAMP;
          n.vy *= DAMP;
          const PAD = 40;
          if (n.x < PAD) {
            n.x = PAD;
            n.vx = 0;
          }
          if (n.x > dims.w - PAD) {
            n.x = dims.w - PAD;
            n.vx = 0;
          }
          if (n.y < PAD) {
            n.y = PAD;
            n.vy = 0;
          }
          if (n.y > dims.h - PAD) {
            n.y = dims.h - PAD;
            n.vy = 0;
          }
        }

        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intentionally only run when graph topology / size changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGraph, dims.w, dims.h, nodes.length]);

  // Drag handlers — pin the node while dragging so the sim respects the cursor
  const handleNodeMouseDown = (e: React.MouseEvent, node: SimNode) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    dragState.current = {
      id: node.id,
      offsetX: p.x - node.x,
      offsetY: p.y - node.y,
    };
    setNodes((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, pinned: true } : n))
    );
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    const dragging = dragState.current;
    if (!dragging.id) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    setNodes((prev) =>
      prev.map((n) =>
        n.id === dragging.id
          ? { ...n, x: p.x - dragging.offsetX, y: p.y - dragging.offsetY }
          : n
      )
    );
  };

  const handleSvgMouseUp = () => {
    const id = dragState.current.id;
    if (!id) return;
    dragState.current = { id: null, offsetX: 0, offsetY: 0 };
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: false } : n))
    );
  };

  const handleSvgClick = () => setSelected(null);

  const handleNodeClick = (e: React.MouseEvent, node: SimNode) => {
    e.stopPropagation();
    setSelected((prev) => (prev === node.id ? null : node.id));
  };

  // Connected-nodes set — used to highlight when hovering/selecting
  const highlightSet = useMemo(() => {
    const active = selected || hovered;
    if (!active) return null;
    const set = new Set<string>([active]);
    for (const link of rawGraph.links) {
      if (link.source === active) set.add(link.target);
      if (link.target === active) set.add(link.source);
    }
    return set;
  }, [selected, hovered, rawGraph.links]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selected) ?? null,
    [nodes, selected]
  );

  // Details for the side panel
  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null;
    const incoming = rawGraph.links
      .filter((l) => l.target === selectedNode.id)
      .map((l) => l.source);
    const outgoing = rawGraph.links
      .filter((l) => l.source === selectedNode.id)
      .map((l) => l.target);
    return { incoming, outgoing };
  }, [selectedNode, rawGraph.links]);

  return (
    <div className="kg-panel-interactive">
      {/* Toolbar */}
      <div className="kg-toolbar">
        <div className="kg-toolbar-left">
          <span className="kg-title">Knowledge Graph</span>
          {isPlaceholder && (
            <span className="kg-pill">Placeholder — chat to build your real graph</span>
          )}
          {!isPlaceholder && (
            <span className="kg-pill kg-pill-live">
              {rawGraph.nodes.length} concepts · {rawGraph.links.length} connections
            </span>
          )}
        </div>
        <div className="kg-toolbar-right">
          <div className="kg-legend">
            <span className="kg-legend-item">
              <span className="kg-dot" style={{ background: '#ef4444' }} /> gap
            </span>
            <span className="kg-legend-item">
              <span className="kg-dot" style={{ background: '#eab308' }} /> shaky
            </span>
            <span className="kg-legend-item">
              <span className="kg-dot" style={{ background: '#22c55e' }} /> solid
            </span>
          </div>
          <button className="kg-btn" onClick={loadGraph} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="kg-canvas-wrap">
        <svg
          ref={svgRef}
          className="kg-canvas"
          width={dims.w}
          height={dims.h}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
          onClick={handleSvgClick}
        >
          <defs>
            <marker
              id="kg-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="rgba(255,255,255,0.35)" />
            </marker>
          </defs>

          {/* Edges */}
          <g>
            {rawGraph.links.map((link, i) => {
              const a = nodes.find((n) => n.id === link.source);
              const b = nodes.find((n) => n.id === link.target);
              if (!a || !b) return null;
              const active =
                !highlightSet ||
                (highlightSet.has(a.id) && highlightSet.has(b.id));
              return (
                <line
                  key={i}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.08)'}
                  strokeWidth={active ? 1.6 : 1}
                  markerEnd="url(#kg-arrow)"
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n) => {
              const r = 14 + n.confidence * 14;
              const color = confidenceColor(n.confidence);
              const dim = highlightSet && !highlightSet.has(n.id);
              const isSel = selected === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1 }}
                  onMouseDown={(e) => handleNodeMouseDown(e, n)}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => handleNodeClick(e, n)}
                >
                  {/* Glow for selected */}
                  {isSel && (
                    <circle
                      r={r + 8}
                      fill="none"
                      stroke={color}
                      strokeWidth={2}
                      opacity={0.5}
                    />
                  )}
                  <circle
                    r={r}
                    fill={color}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth={isSel ? 2 : 1}
                  />
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fill="white"
                    fontSize={11}
                    fontWeight={500}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {n.id.length > 22 ? n.id.slice(0, 22) + '…' : n.id}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* Side panel — appears when a node is selected */}
        {selectedNode && selectedDetails && (
          <div className="kg-sidepanel">
            <div className="kg-sidepanel-header">
              <h3>{selectedNode.id}</h3>
              <button
                className="kg-close"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                &#x2715;
              </button>
            </div>

            <div className="kg-stat-row">
              <div
                className="kg-confidence-bar"
                style={{
                  background: `linear-gradient(to right, ${confidenceColor(
                    selectedNode.confidence
                  )} ${selectedNode.confidence * 100}%, rgba(255,255,255,0.1) ${
                    selectedNode.confidence * 100
                  }%)`,
                }}
              />
              <span className="kg-stat-value">
                {(selectedNode.confidence * 100).toFixed(0)}% · {confidenceLabel(selectedNode.confidence)}
              </span>
            </div>

            {selectedNode.source && (
              <div className="kg-meta">
                <span className="kg-meta-label">Source</span>
                <span className="kg-meta-value">{selectedNode.source}</span>
              </div>
            )}

            <div className="kg-section">
              <h4>Depends on ({selectedDetails.outgoing.length})</h4>
              {selectedDetails.outgoing.length === 0 ? (
                <p className="kg-section-empty">No prerequisites</p>
              ) : (
                <ul>
                  {selectedDetails.outgoing.map((id) => (
                    <li key={id}>
                      <button
                        className="kg-link-btn"
                        onClick={() => setSelected(id)}
                      >
                        {id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="kg-section">
              <h4>Used by ({selectedDetails.incoming.length})</h4>
              {selectedDetails.incoming.length === 0 ? (
                <p className="kg-section-empty">Nothing depends on this yet</p>
              ) : (
                <ul>
                  {selectedDetails.incoming.map((id) => (
                    <li key={id}>
                      <button
                        className="kg-link-btn"
                        onClick={() => setSelected(id)}
                      >
                        {id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

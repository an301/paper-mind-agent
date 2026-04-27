import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter, Search, Sparkles } from "lucide-react";
import { cn } from "../util";
import { Badge, Button, Card, Input, Kbd, Select } from "../primitives";

/* ────────────────────────────────────────────────────────────────────
   Session dashboard — tabular, sparklines, sortable, row hover.
   ──────────────────────────────────────────────────────────────────── */

type Session = {
  id: string;
  date: string;
  paper: string;
  minutes: number;
  concepts: number;
  gaps: number;
  understanding: number[]; // trajectory for sparkline
  outcome: "active" | "mastered" | "stalled";
};

const SESSIONS: Session[] = [
  { id: "s01", date: "Apr 19", paper: "OneDiffusion", minutes: 42, concepts: 8, gaps: 2, understanding: [0.2, 0.28, 0.31, 0.39, 0.44, 0.52, 0.58, 0.61], outcome: "active" },
  { id: "s02", date: "Apr 17", paper: "OneDiffusion", minutes: 28, concepts: 5, gaps: 3, understanding: [0.15, 0.19, 0.22, 0.28, 0.32, 0.38, 0.41], outcome: "active" },
  { id: "s03", date: "Apr 15", paper: "DDPM (Ho et al.)", minutes: 61, concepts: 14, gaps: 1, understanding: [0.3, 0.42, 0.55, 0.68, 0.74, 0.78, 0.82, 0.85, 0.88, 0.91], outcome: "mastered" },
  { id: "s04", date: "Apr 14", paper: "DDPM (Ho et al.)", minutes: 36, concepts: 9, gaps: 4, understanding: [0.2, 0.28, 0.35, 0.42, 0.52, 0.58, 0.62], outcome: "active" },
  { id: "s05", date: "Apr 10", paper: "Song et al. SDEs", minutes: 14, concepts: 3, gaps: 5, understanding: [0.1, 0.12, 0.15, 0.16, 0.17], outcome: "stalled" },
  { id: "s06", date: "Apr 08", paper: "Complete Recipe", minutes: 52, concepts: 11, gaps: 2, understanding: [0.25, 0.3, 0.38, 0.48, 0.58, 0.68, 0.75, 0.81], outcome: "mastered" },
  { id: "s07", date: "Apr 04", paper: "Flow Matching (Lipman)", minutes: 18, concepts: 4, gaps: 6, understanding: [0.05, 0.08, 0.1, 0.12, 0.15], outcome: "stalled" },
  { id: "s08", date: "Apr 02", paper: "Classifier-Free Guidance", minutes: 22, concepts: 6, gaps: 2, understanding: [0.3, 0.38, 0.44, 0.51, 0.56, 0.62], outcome: "active" },
];

type SortKey = "date" | "paper" | "minutes" | "concepts" | "gaps";
type Dir = "asc" | "desc";

export default function Dashboard() {
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: "date", dir: "desc" });
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<"all" | Session["outcome"]>("all");

  const rows = useMemo(() => {
    let r = SESSIONS;
    if (outcome !== "all") r = r.filter((s) => s.outcome === outcome);
    if (query) {
      const q = query.toLowerCase();
      r = r.filter((s) => s.paper.toLowerCase().includes(q));
    }
    r = [...r].sort((a, b) => {
      const va = a[sort.key], vb = b[sort.key];
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return r;
  }, [sort, query, outcome]);

  const totals = useMemo(() => ({
    sessions: rows.length,
    minutes: rows.reduce((a, b) => a + b.minutes, 0),
    concepts: rows.reduce((a, b) => a + b.concepts, 0),
    gaps: rows.reduce((a, b) => a + b.gaps, 0),
  }), [rows]);

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" },
    );

  return (
    <div className="ds-root min-h-screen bg-bg" data-theme="dark">
      {/* Header */}
      <header className="flex h-12 items-center justify-between border-b border-border bg-bg-elevated px-4">
        <div className="flex items-center gap-3">
          <a href="#" className="flex items-center gap-2 text-sm font-medium text-fg hover:text-accent">
            <span className="h-2 w-2 rounded-full bg-accent" />
            paper-mind
          </a>
          <span className="text-fg-subtle">/</span>
          <span className="text-sm text-fg-default">sessions</span>
        </div>
        <Input
          size="sm"
          placeholder="Jump to a session…"
          leadingIcon={<Search size={13} strokeWidth={1.5} />}
          trailingIcon={<Kbd keys="cmd+k" size="sm" />}
          className="w-72"
        />
      </header>

      <div className="mx-auto max-w-[1100px] px-8 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-display text-fg">Sessions</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Papers read, time spent, concepts surfaced, gaps closed.
            </p>
          </div>
          <Button variant="primary" size="sm" leadingIcon={<Sparkles size={13} strokeWidth={1.5} />}>
            Start new session
          </Button>
        </div>

        {/* Summary row */}
        <div className="mb-8 grid grid-cols-4 gap-3">
          <Stat label="Total sessions" value={String(totals.sessions)} />
          <Stat label="Time spent" value={`${Math.floor(totals.minutes / 60)}h ${totals.minutes % 60}m`} />
          <Stat label="Concepts surfaced" value={String(totals.concepts)} />
          <Stat label="Open gaps" value={String(totals.gaps)} tone="warning" />
        </div>

        {/* Filter row */}
        <div className="mb-3 flex items-center gap-2">
          <Input
            size="sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter papers…"
            leadingIcon={<Search size={13} strokeWidth={1.5} />}
            className="w-64"
          />
          <Select
            size="sm"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="all">All outcomes</option>
            <option value="active">Active</option>
            <option value="mastered">Mastered</option>
            <option value="stalled">Stalled</option>
          </Select>
          <Button variant="ghost" size="sm" leadingIcon={<Filter size={13} strokeWidth={1.5} />}>
            More filters
          </Button>
          <div className="ml-auto font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
            {rows.length} of {SESSIONS.length}
          </div>
        </div>

        {/* Table */}
        <Card bare>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                <Th onClick={() => toggleSort("date")} active={sort.key === "date"} dir={sort.dir}>
                  Date
                </Th>
                <Th onClick={() => toggleSort("paper")} active={sort.key === "paper"} dir={sort.dir}>
                  Paper
                </Th>
                <Th onClick={() => toggleSort("minutes")} active={sort.key === "minutes"} dir={sort.dir} align="right">
                  Time
                </Th>
                <Th onClick={() => toggleSort("concepts")} active={sort.key === "concepts"} dir={sort.dir} align="right">
                  Concepts
                </Th>
                <Th onClick={() => toggleSort("gaps")} active={sort.key === "gaps"} dir={sort.dir} align="right">
                  Gaps
                </Th>
                <th className="px-4 py-2.5">Trajectory</th>
                <th className="px-4 py-2.5 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr
                  key={s.id}
                  className={cn(
                    "group cursor-pointer border-b border-border last:border-0",
                    "transition-colors duration-quick ease-smooth hover:bg-bg-hover",
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-muted">{s.date}</td>
                  <td className="px-4 py-3 text-fg-default">{s.paper}</td>
                  <Td right mono>{s.minutes}m</Td>
                  <Td right mono>{s.concepts}</Td>
                  <Td right mono className={s.gaps > 3 ? "text-warning" : "text-fg-muted"}>
                    {s.gaps}
                  </Td>
                  <td className="px-4 py-3">
                    <Sparkline values={s.understanding} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <OutcomeBadge outcome={s.outcome} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <footer className="mt-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
          <span>paper-mind · sessions</span>
          <span>press <Kbd keys="cmd+k" size="sm" /> to jump to a session</span>
        </footer>
      </div>
    </div>
  );
}

function Th({
  children,
  onClick,
  active,
  dir,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  dir: Dir;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "cursor-pointer select-none px-4 py-2.5",
        align === "right" && "text-right",
      )}
      onClick={onClick}
    >
      <span className={cn("inline-flex items-center gap-1", active && "text-fg")}>
        {children}
        <span className="text-fg-subtle">
          {active ? (
            dir === "asc" ? <ArrowUp size={10} strokeWidth={1.5} /> : <ArrowDown size={10} strokeWidth={1.5} />
          ) : (
            <ChevronsUpDown size={10} strokeWidth={1.5} />
          )}
        </span>
      </span>
    </th>
  );
}

function Td({
  children,
  right,
  mono,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3",
        right && "text-right",
        mono && "font-mono",
        className,
      )}
    >
      {children}
    </td>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
        {label}
      </div>
      <div
        className={cn(
          "mt-2 text-xl font-medium",
          tone === "warning" ? "text-warning" : "text-fg",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: Session["outcome"] }) {
  const map = {
    active:   { tone: "accent" as const, label: "active" },
    mastered: { tone: "success" as const, label: "mastered" },
    stalled:  { tone: "danger" as const, label: "stalled" },
  };
  const { tone, label } = map[outcome];
  return <Badge tone={tone} dot>{label}</Badge>;
}

function Sparkline({ values }: { values: number[] }) {
  const w = 140, h = 24, pad = 2;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values[values.length - 1];
  const lastColor = last >= 0.66 ? "var(--success)" : last >= 0.33 ? "var(--warning)" : "var(--danger)";
  const [lx, ly] = points[points.length - 1].split(",").map(Number);
  return (
    <svg width={w} height={h} className="block">
      <polyline
        fill="none"
        stroke="var(--fg-subtle)"
        strokeWidth="1"
        points={points.join(" ")}
      />
      <circle cx={lx} cy={ly} r="2" fill={lastColor} />
    </svg>
  );
}

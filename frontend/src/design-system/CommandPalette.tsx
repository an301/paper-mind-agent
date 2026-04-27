import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BarChart3,
  Network,
  Palette,
  Settings,
  FileText,
  Sparkles,
} from "lucide-react";
import { cn } from "./util";
import { Kbd } from "./primitives/Kbd";

/* ────────────────────────────────────────────────────────────────────
   Global Cmd-K palette.
   Opens with ⌘K / Ctrl-K anywhere. Navigates surfaces, recent papers,
   recent sessions, concepts. Real keyboard nav (cmdk handles arrows).
   ──────────────────────────────────────────────────────────────────── */

type Surface = {
  id: string;
  hash: string;
  label: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const SURFACES: Surface[] = [
  { id: "reader",     hash: "#reader",     label: "Reader",            hint: "Read a paper", icon: BookOpen },
  { id: "graph",      hash: "#graph",      label: "Knowledge graph",   hint: "Concepts, prereqs, gaps", icon: Network },
  { id: "dashboard",  hash: "#dashboard",  label: "Sessions dashboard",hint: "Papers, time, trajectory", icon: BarChart3 },
  { id: "landing",    hash: "#landing",    label: "Landing",           hint: "Public page", icon: Sparkles },
  { id: "components", hash: "#components", label: "Component sheet",   hint: "Design system", icon: Palette },
  { id: "tokens",     hash: "#tokens",     label: "Design tokens",     hint: "Design system", icon: Palette },
  { id: "legacy",     hash: "",            label: "Legacy app",        hint: "Current prod UI", icon: Settings },
];

const RECENT_PAPERS = [
  { id: "p1", title: "One Diffusion to Generate Them All", authors: "Le et al.", page: "5/14" },
  { id: "p2", title: "A Complete Recipe for Diffusion Generative Models", authors: "Pandey", page: "fully read" },
  { id: "p3", title: "DDPM: Denoising Diffusion Probabilistic Models", authors: "Ho, Jain, Abbeel", page: "12/25" },
];

const RECENT_CONCEPTS = [
  { id: "c1", name: "classifier-free guidance", conf: 0.18 },
  { id: "c2", name: "denoising score matching", conf: 0.62 },
  { id: "c3", name: "UNet architecture", conf: 0.78 },
  { id: "c4", name: "variance schedule", conf: 0.31 },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const navigate = (hash: string) => {
    window.location.hash = hash;
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/40",
            "data-[state=open]:animate-[ds-fade-in_var(--dur-base)_var(--ease-out)]",
            "data-[state=closed]:animate-[ds-fade-out_var(--dur-quick)_var(--ease-out)]",
          )}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn(
            "ds-root fixed left-1/2 top-[18%] z-50 w-[min(640px,94vw)] -translate-x-1/2",
            "rounded-md border border-border-strong bg-bg-elevated shadow-modal",
            "data-[state=open]:animate-[ds-pop-in_var(--dur-base)_var(--ease-out)]",
            "data-[state=closed]:animate-[ds-pop-out_var(--dur-quick)_var(--ease-out)]",
          )}
          data-theme="dark"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command
            label="Global command palette"
            className="flex flex-col"
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="font-mono text-xs text-fg-subtle">/</span>
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a surface, paper, or concept…"
                className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <Kbd keys="esc" size="sm" />
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto px-2 py-2">
              <Command.Empty className="px-3 py-10 text-center text-xs text-fg-muted">
                No results.
              </Command.Empty>

              <Command.Group heading="Surfaces" className={groupCls}>
                {SURFACES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Command.Item
                      key={s.id}
                      value={`${s.label} ${s.hint}`}
                      onSelect={() => navigate(s.hash)}
                      className={itemCls}
                    >
                      <Icon size={14} strokeWidth={1.5} />
                      <span className="flex-1 text-fg-default">{s.label}</span>
                      <span className="text-xs text-fg-subtle">{s.hint}</span>
                      <ArrowRight size={12} strokeWidth={1.5} className="text-fg-subtle" />
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Recent papers" className={groupCls}>
                {RECENT_PAPERS.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`${p.title} ${p.authors}`}
                    onSelect={() => navigate(`#reader?paper=${p.id}`)}
                    className={itemCls}
                  >
                    <FileText size={14} strokeWidth={1.5} />
                    <span className="flex-1 truncate text-fg-default">{p.title}</span>
                    <span className="font-mono text-[10px] text-fg-subtle">{p.page}</span>
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Recent concepts" className={groupCls}>
                {RECENT_CONCEPTS.map((c) => (
                  <Command.Item
                    key={c.id}
                    value={c.name}
                    onSelect={() => navigate(`#graph?node=${c.id}`)}
                    className={itemCls}
                  >
                    <Network size={14} strokeWidth={1.5} />
                    <span className="flex-1 truncate text-fg-default">{c.name}</span>
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        c.conf >= 0.66
                          ? "text-success"
                          : c.conf >= 0.33
                            ? "text-warning"
                            : "text-danger",
                      )}
                    >
                      {(c.conf * 100).toFixed(0)}%
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>

            <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <Kbd keys="up" size="sm" /> <Kbd keys="down" size="sm" /> navigate
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Kbd keys="enter" size="sm" /> select
                </span>
              </div>
              <span>paper-mind</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const groupCls = cn(
  "mb-2 last:mb-0",
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5",
  "[&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px]",
  "[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-caps",
  "[&_[cmdk-group-heading]]:text-fg-subtle",
);

const itemCls = cn(
  "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm",
  "text-fg-default transition-colors duration-quick ease-smooth",
  "data-[selected=true]:bg-accent-soft data-[selected=true]:text-fg",
);

/** Global hook: attaches ⌘K / Ctrl-K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

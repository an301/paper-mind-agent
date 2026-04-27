import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, X } from "lucide-react";
import { cn } from "../design-system/util";
import { Badge, Button, Input, Kbd } from "../design-system/primitives";

export interface TraceStep {
  id: string;
  name: string;
  input: Record<string, unknown>;
  startedAt: number;
  endedAt?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  context?: string;
  trace?: TraceStep[];
}

interface ChatPanelProps {
  messages: Message[];
  isTyping: boolean;
  onSendMessage: (text: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  selectionContext: string | null;
  onClearContext: () => void;
}

export default function ChatPanel({
  messages,
  isTyping,
  onSendMessage,
  input,
  onInputChange,
  selectionContext,
  onClearContext,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  useEffect(() => {
    if (selectionContext) textareaRef.current?.focus();
  }, [selectionContext]);

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;
    onSendMessage(trimmed);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Pair user + assistant turns visually
  const turns = useMemo(() => {
    const arr: Array<{ user?: Message; assistant?: Message }> = [];
    let current: { user?: Message; assistant?: Message } = {};
    for (const m of messages) {
      if (m.role === "user") {
        if (current.user || current.assistant) arr.push(current);
        current = { user: m };
      } else {
        current.assistant = m;
      }
    }
    if (current.user || current.assistant) arr.push(current);
    return arr;
  }, [messages]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-bg">
      {/* Agent header */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-caps text-fg-muted">
            agent
          </span>
          <Badge dot tone={isTyping ? "accent" : "success"}>
            {isTyping ? "thinking" : "idle"}
          </Badge>
        </div>
        <div className="font-mono text-[10px] text-fg-subtle">
          claude-sonnet-4-6
        </div>
      </header>

      {/* Message stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 && !isTyping ? (
          <EmptyState onPick={onInputChange} />
        ) : (
          <div className="space-y-8">
            {turns.map((t, i) => (
              <Turn
                key={t.user?.id ?? t.assistant?.id ?? i}
                user={t.user}
                assistant={t.assistant}
                isLastAssistant={i === turns.length - 1 && isTyping}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer input */}
      <footer className="border-t border-border p-3">
        {selectionContext && (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-sm border border-border bg-bg-elevated px-3 py-2">
            <div className="min-w-0">
              <div className="mb-0.5 font-mono text-[9px] uppercase tracking-caps text-fg-subtle">
                asking about
              </div>
              <p className="truncate text-xs text-fg-default">
                &ldquo;{truncate(selectionContext, 120)}&rdquo;
              </p>
            </div>
            <button
              type="button"
              onClick={onClearContext}
              className="rounded-sm p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
              aria-label="Clear context"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={isTyping}
            placeholder={
              selectionContext
                ? "Ask about the highlighted text…"
                : "Ask about this paper…"
            }
            className={cn(
              "block w-full resize-none rounded-sm border bg-bg-elevated px-3 py-2 pr-14 text-sm text-fg",
              "placeholder:text-fg-subtle",
              "transition-colors duration-quick ease-smooth",
              "border-border-strong hover:border-fg-subtle",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-ring",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
            style={{ minHeight: 36, maxHeight: 160 }}
          />
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <Kbd keys="enter" size="sm" />
          </div>
        </div>
      </footer>
    </aside>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function Turn({
  user,
  assistant,
  isLastAssistant,
}: {
  user?: Message;
  assistant?: Message;
  isLastAssistant: boolean;
}) {
  return (
    <div>
      {user && (
        <div className="mb-4">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
            query
          </div>
          {user.context && (
            <div className="mb-2 rounded-sm border-l-2 border-accent bg-accent-soft/30 px-3 py-1.5 text-xs leading-snug text-fg-default">
              <span className="mr-2 font-mono text-[9px] uppercase tracking-caps text-fg-muted">
                highlighted
              </span>
              {truncate(user.context, 160)}
            </div>
          )}
          <p className="text-sm leading-snug text-fg-default">{user.content}</p>
        </div>
      )}

      {assistant && (
        <>
          {assistant.trace && assistant.trace.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                  trace · {assistant.trace.length} step
                  {assistant.trace.length !== 1 && "s"}
                </div>
              </div>
              <TraceTree steps={assistant.trace} active={isLastAssistant} />
            </div>
          )}

          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
              response
            </div>
            <div className="prose-compact text-sm leading-body text-fg-default">
              {renderMarkdown(assistant.content)}
              {isLastAssistant && (
                <span className="ml-1 inline-block h-4 w-[2px] translate-y-0.5 bg-accent [animation:dotPulse_1s_ease-in-out_infinite]" />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TraceTree({ steps, active }: { steps: TraceStep[]; active: boolean }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="relative rounded-sm border border-border bg-bg-elevated p-2">
      <div
        className="absolute bottom-3 left-[15px] top-3 w-px bg-border"
        aria-hidden
      />
      <ul className="space-y-0.5">
        {steps.map((s, i) => {
          const isLast = i === steps.length - 1;
          const pending = active && isLast && !s.endedAt;
          const latency =
            s.endedAt && s.startedAt
              ? `${Math.max(1, Math.round(s.endedAt - s.startedAt))}ms`
              : pending
                ? "…"
                : "—";
          return (
            <li key={s.id} className="relative pl-6">
              <span
                className={cn(
                  "absolute left-[11px] top-[10px] h-1.5 w-1.5 rounded-full border border-bg-elevated",
                  pending ? "bg-accent" : "bg-accent/80",
                )}
              />
              <button
                type="button"
                onClick={() =>
                  setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))
                }
                className={cn(
                  "flex w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-left",
                  "transition-colors duration-quick ease-smooth hover:bg-bg-hover",
                )}
              >
                <span className="mt-0.5 text-fg-subtle">
                  {expanded[s.id] ? (
                    <ChevronDown size={11} strokeWidth={1.5} />
                  ) : (
                    <ChevronRight size={11} strokeWidth={1.5} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-caps text-accent">
                      action
                    </span>
                    <span className="truncate font-mono text-[11px] text-fg">
                      {s.name}
                    </span>
                    <span
                      className={cn(
                        "ml-auto font-mono text-[10px]",
                        pending ? "text-accent" : "text-fg-subtle",
                      )}
                    >
                      {latency}
                    </span>
                  </div>
                </div>
              </button>
              {expanded[s.id] && (
                <div className="ml-5 mt-1 rounded-sm border-l border-border pl-3 font-mono text-[10px] leading-snug text-fg-muted">
                  <pre className="whitespace-pre-wrap break-words">
                    {JSON.stringify(s.input, null, 2)}
                  </pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const suggestions = [
    "What is this paper about?",
    "Explain section 1",
    "What are the key contributions?",
    "What prerequisites should I know?",
  ];
  return (
    <div className="mt-16 flex flex-col items-start">
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md border border-border bg-bg-elevated text-accent">
        <Sparkles size={14} strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-medium text-fg">Ask about this paper.</h3>
      <p className="mt-1 text-xs leading-snug text-fg-muted">
        Highlight text on the left to ask about a specific passage, or pick a starting point below.
      </p>
      <div className="mt-5 flex w-full flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className={cn(
              "rounded-sm border border-border bg-bg-elevated px-3 py-2 text-left text-xs text-fg-default",
              "transition-colors duration-quick ease-smooth hover:border-fg-subtle hover:bg-bg-hover",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Utilities ─────────────────────────────────────────────────── */

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Very light markdown rendering — we don't pull in a full parser.
 * Handles **bold**, *italic*, `code`, and paragraph breaks. Good enough
 * for streaming assistant output; upgrade if we need tables/lists.
 */
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((p, i) => {
    // Bullet lists (simple detection: every line starts with "- " or "* ")
    const lines = p.split("\n");
    const allBullets = lines.length > 1 && lines.every((l) => /^[-*]\s/.test(l.trim()));
    if (allBullets) {
      return (
        <ul key={i} className="my-2 list-disc space-y-1 pl-5">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^[-*]\s/, ""))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className={i > 0 ? "mt-3" : undefined}>
        {lines.map((l, j) => (
          <span key={j}>
            {renderInline(l)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Split on `code`, **bold**, *italic*, heading markers (#)
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-medium text-fg">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded-sm border border-border bg-bg-raised px-1 py-0.5 font-mono text-[11px] text-fg-default"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    cursor = m.index + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

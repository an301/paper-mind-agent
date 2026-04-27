import { useCallback, useRef, useState } from "react";
import {
  FileText,
  AlertTriangle,
  Loader2,
  Network,
  X,
} from "lucide-react";
import UploadZone from "./components/UploadZone";
import DocumentViewer from "./components/DocumentViewer";
import ChatPanel, {
  type Message,
  type TraceStep,
} from "./components/ChatPanel";
import KnowledgeGraphPanel from "./components/KnowledgeGraphPanel";
import {
  uploadPaper,
  sendChatMessage,
  updateReadingPosition,
  type StreamEvent,
} from "./api";
import { cn } from "./design-system/util";
import { Badge, Button, Input, Kbd } from "./design-system/primitives";

interface Paper {
  id: string;
  name: string;
  file: File;
  url: string;
  backendPaperId: string | null;
  status: "uploading" | "ready" | "error";
  sections: string[];
}

type Tab = "paper" | "graph";

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("paper");
  const [messagesByPaper, setMessagesByPaper] = useState<
    Record<string, Message[]>
  >({});
  const [sessionsByPaper, setSessionsByPaper] = useState<
    Record<string, string>
  >({});
  const [isTyping, setIsTyping] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [positionsByPaper, setPositionsByPaper] = useState<
    Record<string, { current: number; max: number; total: number }>
  >({});
  const [lineByPaper, setLineByPaper] = useState<
    Record<string, { snippet: string; page: number }>
  >({});
  const [selectionContext, setSelectionContext] = useState<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePaper = papers.find((p) => p.id === activePaperId) ?? null;
  const currentMessages = activePaperId
    ? messagesByPaper[activePaperId] || []
    : [];
  const readingPosition = activePaperId
    ? positionsByPaper[activePaperId] || { current: 0, max: 0, total: 0 }
    : { current: 0, max: 0, total: 0 };

  /* ── Upload flow ─────────────────────────────────────────────── */
  const handleFileUpload = async (file: File) => {
    const localUrl = URL.createObjectURL(file);
    const localId = Date.now().toString();
    const paper: Paper = {
      id: localId,
      name: file.name.replace(/\.[^/.]+$/, ""),
      file,
      url: localUrl,
      backendPaperId: null,
      status: "uploading",
      sections: [],
    };
    setPapers((prev) => [...prev, paper]);
    setActivePaperId(localId);
    setTab("paper");

    try {
      const result = await uploadPaper(file);
      setPapers((prev) =>
        prev.map((p) =>
          p.id === localId
            ? {
                ...p,
                backendPaperId: result.paper_id,
                name: result.title || p.name,
                sections: result.section_names,
                status: "ready" as const,
              }
            : p,
        ),
      );
    } catch {
      setPapers((prev) =>
        prev.map((p) =>
          p.id === localId ? { ...p, status: "error" as const } : p,
        ),
      );
    }
  };

  const handleRemovePaper = (id: string) => {
    const paper = papers.find((p) => p.id === id);
    if (paper) URL.revokeObjectURL(paper.url);
    setPapers((prev) => prev.filter((p) => p.id !== id));
    setMessagesByPaper((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activePaperId === id) {
      const remaining = papers.filter((p) => p.id !== id);
      setActivePaperId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  /* ── Chat flow ───────────────────────────────────────────────── */
  const appendMessage = useCallback((paperId: string, message: Message) => {
    setMessagesByPaper((prev) => ({
      ...prev,
      [paperId]: [...(prev[paperId] || []), message],
    }));
  }, []);

  const updateAssistant = useCallback(
    (paperId: string, msgId: string, updater: (m: Message) => Message) => {
      setMessagesByPaper((prev) => {
        const msgs = prev[paperId] || [];
        return {
          ...prev,
          [paperId]: msgs.map((m) => (m.id === msgId ? updater(m) : m)),
        };
      });
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activePaperId || isTyping) return;

      const paperId = activePaperId;
      const context = selectionContext;

      let fullMessage = text;
      if (context) {
        fullMessage = `[Highlighted text from the paper: "${context}"]\n\n${text}`;
      }

      const userMessage: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
        context: context || undefined,
      };
      appendMessage(paperId, userMessage);
      setChatInput("");
      setSelectionContext(null);
      setIsTyping(true);

      const assistantId = `a-${Date.now() + 1}`;
      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        trace: [],
      };
      appendMessage(paperId, assistantMessage);

      const sessionId = sessionsByPaper[paperId] || null;
      const paper = papers.find((p) => p.id === paperId);
      const pos = positionsByPaper[paperId];
      const line = lineByPaper[paperId];
      const currentPaperId = paper?.backendPaperId ?? null;
      const currentPage = pos?.current ?? 0;
      const currentLine = line?.snippet ?? "";

      try {
        const returnedSessionId = await sendChatMessage(
          fullMessage,
          sessionId,
          (event: StreamEvent) => {
            if (event.type === "token" && event.text) {
              const t = event.text;
              updateAssistant(paperId, assistantId, (m) => ({
                ...m,
                content: m.content + t,
              }));
            } else if (event.type === "tool_call") {
              const step: TraceStep = {
                id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: event.name || "unknown_tool",
                input: event.input || {},
                startedAt: performance.now(),
              };
              updateAssistant(paperId, assistantId, (m) => {
                // Close out the previous open step
                const prevTrace = m.trace ?? [];
                const closed = prevTrace.map((s, i) =>
                  i === prevTrace.length - 1 && !s.endedAt
                    ? { ...s, endedAt: performance.now() }
                    : s,
                );
                return { ...m, trace: [...closed, step] };
              });
            }
          },
          currentPaperId,
          currentPage,
          currentLine,
        );

        // Close out the final pending step when done
        updateAssistant(paperId, assistantId, (m) => {
          const trace = m.trace ?? [];
          if (trace.length === 0) return m;
          const last = trace[trace.length - 1];
          if (last.endedAt) return m;
          return {
            ...m,
            trace: trace.map((s, i) =>
              i === trace.length - 1 ? { ...s, endedAt: performance.now() } : s,
            ),
          };
        });

        if (returnedSessionId) {
          setSessionsByPaper((prev) => ({
            ...prev,
            [paperId]: returnedSessionId,
          }));
        }
      } catch (err) {
        const errorText = err instanceof Error ? err.message : "Unknown error";
        updateAssistant(paperId, assistantId, (m) => ({
          ...m,
          content:
            m.content +
            `\n\n**Error:** ${errorText}. Make sure the backend is running: \`uvicorn backend.api:app --reload\``,
        }));
      }

      setIsTyping(false);
    },
    [
      activePaperId,
      isTyping,
      selectionContext,
      sessionsByPaper,
      appendMessage,
      updateAssistant,
      papers,
      positionsByPaper,
      lineByPaper,
    ],
  );

  const handleSelectContext = useCallback((text: string) => {
    setSelectionContext(text);
  }, []);

  const handleReadingPositionChange = useCallback(
    (current: number, max: number, total: number) => {
      const paperId = activePaperId;
      if (!paperId) return;

      setPositionsByPaper((prev) => ({
        ...prev,
        [paperId]: { current, max, total },
      }));

      const paper = papers.find((p) => p.id === paperId);
      if (!paper?.backendPaperId) return;
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        updateReadingPosition({
          paper_id: paper.backendPaperId!,
          title: paper.name,
          current_page: current,
          total_pages: total,
        }).catch(() => {});
      }, 500);
    },
    [activePaperId, papers],
  );

  const handleCurrentLineChange = useCallback(
    (snippet: string, page: number) => {
      const paperId = activePaperId;
      if (!paperId) return;
      setLineByPaper((prev) => {
        if (prev[paperId]?.snippet === snippet) return prev;
        return { ...prev, [paperId]: { snippet, page } };
      });
    },
    [activePaperId],
  );

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="ds-root h-screen overflow-hidden" data-theme="dark">
      <div className="flex h-full">
        {/* Sidebar — library */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-bg-elevated">
          <div className="flex h-11 items-center gap-2 border-b border-border px-4">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-sm font-medium text-fg">paper-mind</span>
            <Badge variant="outline" tone="accent">alpha</Badge>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <UploadZone onFileUpload={handleFileUpload} />
            </div>

            <div className="px-3">
              <div className="mb-2 flex items-center justify-between px-1 font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                <span>library</span>
                <span>{papers.length}</span>
              </div>
              {papers.length === 0 ? (
                <p className="px-1 py-2 text-xs text-fg-muted">
                  No papers yet. Drop one above to get started.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {papers.map((p) => (
                    <li key={p.id}>
                      <button
                        className={cn(
                          "group flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left",
                          "transition-colors duration-quick ease-smooth",
                          p.id === activePaperId
                            ? "bg-accent-soft text-fg"
                            : "text-fg-default hover:bg-bg-hover",
                        )}
                        onClick={() => {
                          setActivePaperId(p.id);
                          setTab("paper");
                        }}
                      >
                        <span className="mt-0.5 shrink-0 text-fg-muted">
                          {p.status === "uploading" ? (
                            <Loader2
                              size={13}
                              strokeWidth={1.5}
                              className="animate-spin"
                            />
                          ) : p.status === "error" ? (
                            <AlertTriangle
                              size={13}
                              strokeWidth={1.5}
                              className="text-danger"
                            />
                          ) : (
                            <FileText size={13} strokeWidth={1.5} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{p.name}</span>
                          <span className="block font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                            {p.status === "uploading"
                              ? "parsing"
                              : p.status === "error"
                                ? "error"
                                : `${p.sections.length || "—"} sections`}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePaper(p.id);
                          }}
                          className="rounded-sm p-1 text-fg-subtle opacity-0 transition-opacity duration-quick ease-smooth group-hover:opacity-100 hover:bg-bg-active hover:text-fg"
                          aria-label="Remove paper"
                        >
                          <X size={11} strokeWidth={1.5} />
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <footer className="border-t border-border p-3">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
              <span>press</span>
              <Kbd keys="cmd+k" size="sm" />
            </div>
          </footer>
        </aside>

        {/* Main */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-bg-elevated px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="truncate text-sm text-fg">
                {activePaper ? activePaper.name : "No paper selected"}
              </span>
              {activePaper?.status === "uploading" && (
                <Badge dot tone="accent">parsing</Badge>
              )}
              {readingPosition.total > 0 &&
                tab === "paper" &&
                activePaper?.status === "ready" && (
                  <span className="font-mono text-[10px] uppercase tracking-caps text-fg-subtle">
                    page {readingPosition.current} / {readingPosition.total}
                    {readingPosition.max > readingPosition.current &&
                      ` · max ${readingPosition.max}`}
                  </span>
                )}
              {activePaperId &&
                lineByPaper[activePaperId]?.snippet &&
                tab === "paper" && (
                  <span
                    className="max-w-[420px] truncate font-mono text-[10px] text-fg-muted"
                    title={lineByPaper[activePaperId].snippet}
                  >
                    &ldquo;{lineByPaper[activePaperId].snippet}&rdquo;
                  </span>
                )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0 rounded-sm border border-border bg-bg p-0.5">
                <TabButton
                  active={tab === "paper"}
                  onClick={() => setTab("paper")}
                  icon={<FileText size={12} strokeWidth={1.5} />}
                  label="Paper"
                />
                <TabButton
                  active={tab === "graph"}
                  onClick={() => setTab("graph")}
                  icon={<Network size={12} strokeWidth={1.5} />}
                  label="Graph"
                />
              </div>
              <Input
                size="sm"
                placeholder="Jump to…"
                trailingIcon={<Kbd keys="cmd+k" size="sm" />}
                className="w-52"
                onFocus={(e) => {
                  e.currentTarget.blur();
                  // Delegate to the global Cmd-K palette
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                  );
                }}
                readOnly
              />
            </div>
          </header>

          {/* Content */}
          <div className="flex min-h-0 flex-1">
            {tab === "paper" ? (
              <>
                <div className="min-w-0 flex-1">
                  <DocumentViewer
                    fileUrl={activePaper?.url ?? null}
                    fileName={activePaper ? activePaper.file.name : null}
                    onReadingPositionChange={handleReadingPositionChange}
                    onCurrentLineChange={handleCurrentLineChange}
                    onSelectContext={handleSelectContext}
                  />
                </div>
                <div className="w-[400px] shrink-0">
                  <ChatPanel
                    messages={currentMessages}
                    isTyping={isTyping}
                    onSendMessage={handleSendMessage}
                    input={chatInput}
                    onInputChange={setChatInput}
                    selectionContext={selectionContext}
                    onClearContext={() => setSelectionContext(null)}
                  />
                </div>
              </>
            ) : (
              <div className="min-w-0 flex-1">
                <KnowledgeGraphPanel />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-sm px-2",
        "font-mono text-[10px] uppercase tracking-caps",
        "transition-colors duration-quick ease-smooth",
        active
          ? "bg-accent-soft text-fg"
          : "text-fg-muted hover:text-fg",
      )}
    >
      {icon}
      {label}
    </button>
  );
}


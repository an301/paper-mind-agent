import { useState, useCallback, useRef } from 'react';
import UploadZone from './components/UploadZone';
import DocumentViewer from './components/DocumentViewer';
import ChatPanel, { type Message } from './components/ChatPanel';
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel';
import {
  uploadPaper,
  sendChatMessage,
  updateReadingPosition,
  type StreamEvent,
} from './api';
import './App.css';

interface Paper {
  id: string;
  name: string;
  file: File;
  url: string;
  backendPaperId: string | null;
  status: 'uploading' | 'ready' | 'error';
  sections: string[];
}

type Tab = 'paper' | 'graph';

function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('paper');
  const [messagesByPaper, setMessagesByPaper] = useState<Record<string, Message[]>>({});
  const [sessionsByPaper, setSessionsByPaper] = useState<Record<string, string>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [chatInput, setChatInput] = useState('');
  // Per-paper reading positions, keyed by local paper id.
  // Holds live current page, max page reached, and total pages.
  const [positionsByPaper, setPositionsByPaper] = useState<
    Record<string, { current: number; max: number; total: number }>
  >({});
  // Per-paper live line snippet — the text nearest the viewport center.
  // This is the "exactly where the user is" signal the agent uses.
  const [lineByPaper, setLineByPaper] = useState<
    Record<string, { snippet: string; page: number }>
  >({});
  const [selectionContext, setSelectionContext] = useState<string | null>(null);
  // Ref to track the streaming assistant message ID
  const streamingMsgId = useRef<string | null>(null);
  // Throttle timer for persisting reading position to the backend
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activePaper = papers.find((p) => p.id === activePaperId) ?? null;
  const currentMessages = activePaperId
    ? messagesByPaper[activePaperId] || []
    : [];
  const readingPosition = activePaperId
    ? positionsByPaper[activePaperId] || { current: 0, max: 0, total: 0 }
    : { current: 0, max: 0, total: 0 };

  const handleFileUpload = async (file: File) => {
    const localUrl = URL.createObjectURL(file);
    const localId = Date.now().toString();

    const paper: Paper = {
      id: localId,
      name: file.name.replace(/\.[^/.]+$/, ''),
      file,
      url: localUrl,
      backendPaperId: null,
      status: 'uploading',
      sections: [],
    };

    setPapers((prev) => [...prev, paper]);
    setActivePaperId(localId);
    setActiveTab('paper');

    // Upload to backend
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
                status: 'ready' as const,
              }
            : p
        )
      );
    } catch {
      setPapers((prev) =>
        prev.map((p) =>
          p.id === localId ? { ...p, status: 'error' as const } : p
        )
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

  const appendMessage = useCallback((paperId: string, message: Message) => {
    setMessagesByPaper((prev) => ({
      ...prev,
      [paperId]: [...(prev[paperId] || []), message],
    }));
  }, []);

  const updateLastMessage = useCallback((paperId: string, text: string) => {
    setMessagesByPaper((prev) => {
      const msgs = prev[paperId] || [];
      if (msgs.length === 0) return prev;
      const last = msgs[msgs.length - 1];
      return {
        ...prev,
        [paperId]: [
          ...msgs.slice(0, -1),
          { ...last, content: last.content + text },
        ],
      };
    });
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activePaperId || isTyping) return;

      const paperId = activePaperId;
      const context = selectionContext;

      // Build message with context
      let fullMessage = text;
      if (context) {
        fullMessage = `[Highlighted text from the paper: "${context}"]\n\n${text}`;
      }

      // Add user message to UI
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        context: context || undefined,
      };
      appendMessage(paperId, userMessage);
      setChatInput('');
      setSelectionContext(null);
      setIsTyping(true);

      // Create placeholder assistant message for streaming
      const assistantMsgId = (Date.now() + 1).toString();
      streamingMsgId.current = assistantMsgId;
      const assistantMessage: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
      };
      appendMessage(paperId, assistantMessage);

      // Send to backend and stream response
      const sessionId = sessionsByPaper[paperId] || null;
      const paper = papers.find((p) => p.id === paperId);
      const pos = positionsByPaper[paperId];
      const line = lineByPaper[paperId];
      const currentPaperId = paper?.backendPaperId ?? null;
      const currentPage = pos?.current ?? 0;
      const currentLine = line?.snippet ?? '';

      try {
        const returnedSessionId = await sendChatMessage(
          fullMessage,
          sessionId,
          (event: StreamEvent) => {
            if (event.type === 'token' && event.text) {
              updateLastMessage(paperId, event.text);
            } else if (event.type === 'tool_call') {
              // Show tool call as a status in the message
              const toolNote = `\n\n*Using ${event.name}...*\n\n`;
              updateLastMessage(paperId, toolNote);
            }
          },
          currentPaperId,
          currentPage,
          currentLine
        );

        // Store session ID for future messages
        if (returnedSessionId) {
          setSessionsByPaper((prev) => ({
            ...prev,
            [paperId]: returnedSessionId,
          }));
        }
      } catch (err) {
        const errorText = err instanceof Error ? err.message : 'Unknown error';
        updateLastMessage(
          paperId,
          `\n\n**Error:** ${errorText}. Make sure the backend is running: \`uvicorn backend.api:app --reload\``
        );
      }

      streamingMsgId.current = null;
      setIsTyping(false);
    },
    [
      activePaperId,
      isTyping,
      selectionContext,
      sessionsByPaper,
      appendMessage,
      updateLastMessage,
      papers,
      positionsByPaper,
      lineByPaper,
    ]
  );

  const handleSelectContext = useCallback((text: string) => {
    setSelectionContext(text);
  }, []);

  const handleCurrentLineChange = useCallback(
    (snippet: string, page: number) => {
      const paperId = activePaperId;
      if (!paperId) return;
      setLineByPaper((prev) => {
        if (prev[paperId]?.snippet === snippet) return prev;
        return { ...prev, [paperId]: { snippet, page } };
      });
    },
    [activePaperId]
  );

  const handleReadingPositionChange = useCallback(
    (current: number, max: number, total: number) => {
      const paperId = activePaperId;
      if (!paperId) return;

      setPositionsByPaper((prev) => ({
        ...prev,
        [paperId]: { current, max, total },
      }));

      // Throttle persistence to avoid hammering the backend while scrolling.
      // Coalesce bursts into one POST ~500ms after the last scroll event.
      const paper = papers.find((p) => p.id === paperId);
      if (!paper?.backendPaperId) return;

      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        updateReadingPosition({
          paper_id: paper.backendPaperId!,
          title: paper.name,
          current_page: current,
          total_pages: total,
        }).catch(() => {
          // Non-critical: position persistence failing shouldn't break the UI
        });
      }, 500);
    },
    [activePaperId, papers]
  );

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <i className="ph-fill ph-brain" style={{ fontSize: 16 }}></i>
          </div>
          <h1>Research Mind</h1>
          <span>alpha</span>
        </div>

        <div className="sidebar-content">
          <UploadZone onFileUpload={handleFileUpload} />

          <div className="papers-section">
            <h2>Library</h2>
            <div className="papers-list">
              {papers.length === 0 ? (
                <p className="no-papers">No papers uploaded yet</p>
              ) : (
                papers.map((paper) => (
                  <div
                    key={paper.id}
                    className={`paper-item ${paper.id === activePaperId ? 'active' : ''}`}
                    onClick={() => {
                      setActivePaperId(paper.id);
                      setActiveTab('paper');
                    }}
                  >
                    <span className="icon">
                      <i
                        className={
                          paper.status === 'uploading'
                            ? 'ph ph-spinner'
                            : paper.status === 'error'
                              ? 'ph ph-warning'
                              : 'ph-fill ph-file-pdf'
                        }
                        style={{
                          color:
                            paper.status === 'error'
                              ? 'var(--danger)'
                              : paper.status === 'uploading'
                                ? 'var(--text-muted)'
                                : paper.id === activePaperId
                                  ? '#f87171'
                                  : 'var(--text-muted)',
                        }}
                      ></i>
                    </span>
                    <span className="name">{paper.name}</span>
                    <button
                      className="remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemovePaper(paper.id);
                      }}
                    >
                      &#x2715;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <main className="main">
        <div className="topbar">
          <span className="paper-title">
            {activePaper ? activePaper.name : 'No paper selected'}
          </span>
          {activePaper?.status === 'uploading' && (
            <span className="reading-badge parsing">Parsing...</span>
          )}
          {readingPosition.total > 0 &&
            activeTab === 'paper' &&
            activePaper?.status === 'ready' && (
              <span className="reading-badge">
                Page {readingPosition.current} / {readingPosition.total}
                {readingPosition.max > readingPosition.current &&
                  ` · max ${readingPosition.max}`}
              </span>
            )}
          {activeTab === 'paper' &&
            activePaper?.status === 'ready' &&
            activePaperId &&
            lineByPaper[activePaperId]?.snippet && (
              <span
                className="reading-badge"
                title={lineByPaper[activePaperId].snippet}
                style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                Reading: &ldquo;{lineByPaper[activePaperId].snippet}&rdquo;
              </span>
            )}
          <div className="tab-group">
            <button
              className={`tab ${activeTab === 'paper' ? 'active' : ''}`}
              onClick={() => setActiveTab('paper')}
            >
              <i className="ph ph-file-text"></i> Paper
            </button>
            <button
              className={`tab ${activeTab === 'graph' ? 'active' : ''}`}
              onClick={() => setActiveTab('graph')}
            >
              <i className="ph ph-graph"></i> Knowledge Graph
            </button>
          </div>
        </div>

        <div className="content">
          {activeTab === 'paper' ? (
            <div className="paper-view">
              <div className="doc-container">
                <DocumentViewer
                  fileUrl={activePaper?.url ?? null}
                  fileName={activePaper ? activePaper.file.name : null}
                  onReadingPositionChange={handleReadingPositionChange}
                  onCurrentLineChange={handleCurrentLineChange}
                  onSelectContext={handleSelectContext}
                />
              </div>
              <div className="chat-container">
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
            </div>
          ) : (
            <KnowledgeGraphPanel />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

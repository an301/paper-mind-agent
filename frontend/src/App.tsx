import { useState, useCallback, useRef } from 'react';
import UploadZone from './components/UploadZone';
import DocumentViewer from './components/DocumentViewer';
import ChatPanel, { type Message } from './components/ChatPanel';
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel';
import { uploadPaper, sendChatMessage, type StreamEvent } from './api';
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
  const [readingPosition, setReadingPosition] = useState({ page: 0, total: 0 });
  const [selectionContext, setSelectionContext] = useState<string | null>(null);
  // Ref to track the streaming assistant message ID
  const streamingMsgId = useRef<string | null>(null);

  const activePaper = papers.find((p) => p.id === activePaperId) ?? null;
  const currentMessages = activePaperId
    ? messagesByPaper[activePaperId] || []
    : [];

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
          }
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
    ]
  );

  const handleSelectContext = useCallback((text: string) => {
    setSelectionContext(text);
  }, []);

  const handleReadingPositionChange = useCallback(
    (page: number, total: number) => {
      setReadingPosition({ page, total });
    },
    []
  );

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">R</div>
          <h1>Research Mind</h1>
          <span>alpha</span>
        </div>

        <UploadZone onFileUpload={handleFileUpload} />

        <div className="papers-section">
          <h2>Your Papers</h2>
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
                    {paper.status === 'uploading'
                      ? '\u23F3'
                      : paper.status === 'error'
                        ? '\u26A0'
                        : '\uD83D\uDCC4'}
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
      </aside>

      {/* Main area */}
      <main className="main">
        <div className="topbar">
          <span className="paper-title">
            {activePaper ? activePaper.name : 'No paper selected'}
          </span>
          {activePaper?.status === 'uploading' && (
            <span className="reading-badge">Parsing...</span>
          )}
          {readingPosition.total > 0 &&
            activeTab === 'paper' &&
            activePaper?.status === 'ready' && (
              <span className="reading-badge">
                Page {readingPosition.page} / {readingPosition.total}
              </span>
            )}
          <div className="tab-group">
            <button
              className={`tab ${activeTab === 'paper' ? 'active' : ''}`}
              onClick={() => setActiveTab('paper')}
            >
              Paper
            </button>
            <button
              className={`tab ${activeTab === 'graph' ? 'active' : ''}`}
              onClick={() => setActiveTab('graph')}
            >
              Knowledge Graph
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

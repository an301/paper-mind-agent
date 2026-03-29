import { useState, useCallback } from 'react';
import UploadZone from './components/UploadZone';
import DocumentViewer from './components/DocumentViewer';
import ChatPanel, { type Message } from './components/ChatPanel';
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel';
import './App.css';

interface Paper {
  id: string;
  name: string;
  file: File;
  url: string;
}

type Tab = 'paper' | 'graph';

const DUMMY_RESPONSES = [
  "I can see you've uploaded a paper. Let me help you understand it! Which section would you like to start with?",
  "That's a great question. The key insight here is that the transformer architecture replaces recurrence entirely with self-attention mechanisms, allowing for much greater parallelization during training.",
  "Let me break that down. Self-attention works by computing three vectors for each token: Query, Key, and Value. The attention score between two positions is the dot product of the Query of one position with the Key of another, scaled by the square root of the dimension.",
  "Based on what we've discussed, I think you have a solid understanding of the basics. Would you like to dive deeper into multi-head attention, or shall we move on to the next section?",
  "The paper mentions that positional encodings are added to the input embeddings to give the model information about token positions. Without this, the model would have no way to distinguish word order since self-attention is permutation-invariant.",
];

function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('paper');
  const [messagesByPaper, setMessagesByPaper] = useState<Record<string, Message[]>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [readingPosition, setReadingPosition] = useState({ page: 0, total: 0 });
  const [selectionContext, setSelectionContext] = useState<string | null>(null);

  const activePaper = papers.find((p) => p.id === activePaperId) ?? null;
  const currentMessages = activePaperId
    ? messagesByPaper[activePaperId] || []
    : [];

  const handleFileUpload = (file: File) => {
    const url = URL.createObjectURL(file);
    const paper: Paper = {
      id: Date.now().toString(),
      name: file.name.replace(/\.[^/.]+$/, ''),
      file,
      url,
    };
    setPapers((prev) => [...prev, paper]);
    setActivePaperId(paper.id);
    setActiveTab('paper');
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

  const addMessage = useCallback(
    (paperId: string, message: Message) => {
      setMessagesByPaper((prev) => ({
        ...prev,
        [paperId]: [...(prev[paperId] || []), message],
      }));
    },
    []
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!activePaperId || isTyping) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        context: selectionContext || undefined,
      };
      addMessage(activePaperId, userMessage);
      setChatInput('');
      setSelectionContext(null); // Clear context after sending
      setIsTyping(true);

      // Simulate AI response
      const msgCount = messagesByPaper[activePaperId]?.length || 0;
      const responseText = DUMMY_RESPONSES[msgCount % DUMMY_RESPONSES.length];
      const delay = 500 + Math.random() * 1000;

      const paperId = activePaperId;
      setTimeout(() => {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: responseText,
        };
        addMessage(paperId, assistantMessage);
        setIsTyping(false);
      }, delay);
    },
    [activePaperId, isTyping, selectionContext, messagesByPaper, addMessage]
  );

  // Called when user clicks "Ask about this" on highlighted text
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
                  <span className="icon">&#x1F4C4;</span>
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
          {readingPosition.total > 0 && activeTab === 'paper' && (
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

import { useState } from 'react';
import UploadZone from './components/UploadZone';
import ChatPanel from './components/ChatPanel';
import KnowledgeGraphPanel from './components/KnowledgeGraphPanel';
import './App.css';

interface Paper {
  id: string;
  name: string;
  file: File;
}

type Tab = 'chat' | 'graph';

function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  const activePaper = papers.find(p => p.id === activePaperId) ?? null;

  const handleFileUpload = (file: File) => {
    const paper: Paper = {
      id: Date.now().toString(),
      name: file.name.replace('.pdf', ''),
      file,
    };
    setPapers(prev => [...prev, paper]);
    setActivePaperId(paper.id);
  };

  const handleRemovePaper = (id: string) => {
    setPapers(prev => prev.filter(p => p.id !== id));
    if (activePaperId === id) {
      setActivePaperId(papers.length > 1 ? papers.find(p => p.id !== id)!.id : null);
    }
  };

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
              papers.map(paper => (
                <div
                  key={paper.id}
                  className={`paper-item ${paper.id === activePaperId ? 'active' : ''}`}
                  onClick={() => setActivePaperId(paper.id)}
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
          {activePaper && (
            <span className="paper-subtitle">PDF</span>
          )}
          <div className="tab-group">
            <button
              className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveTab('chat')}
            >
              Chat
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
          {activeTab === 'chat' ? <ChatPanel /> : <KnowledgeGraphPanel />}
        </div>
      </main>
    </div>
  );
}

export default App;

import './KnowledgeGraphPanel.css';

export default function KnowledgeGraphPanel() {
  return (
    <div className="kg-panel">
      <div className="kg-empty">
        <div className="kg-empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="36" r="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="36" cy="36" r="4" stroke="currentColor" strokeWidth="2"/>
            <line x1="22" y1="16" x2="14" y2="32" stroke="currentColor" strokeWidth="2"/>
            <line x1="26" y1="16" x2="34" y2="32" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="36" x2="32" y2="36" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </div>
        <h3>Knowledge Graph</h3>
        <p>Your learning journey will appear here as an interactive graph. As you chat about papers, concepts and their relationships will be mapped out visually.</p>
        <span className="kg-badge">Coming in Phase 5</span>
      </div>
    </div>
  );
}

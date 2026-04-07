import { useRef, useEffect } from 'react';
import './ChatPanel.css';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  context?: string; // highlighted text from the document
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus the textarea when context is set (user clicked "Ask about this")
  useEffect(() => {
    if (selectionContext && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [selectionContext]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    onSendMessage(input.trim());
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max) + '...' : text;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-icon">
          <i className="ph-fill ph-sparkle"></i>
        </div>
        <span className="chat-header-title">Research Assistant</span>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <i className="ph-fill ph-sparkle"></i>
            </div>
            <h3>Ask anything about your paper</h3>
            <p>
              Highlight text in the paper to ask specific questions, or type
              below.
            </p>
            <div className="suggestion-chips">
              <button onClick={() => onInputChange('What is this paper about?')}>
                <i className="ph ph-magnifying-glass" style={{ color: 'var(--accent)' }}></i>
                What is this paper about?
              </button>
              <button onClick={() => onInputChange('Explain section 1')}>
                <i className="ph ph-list-numbers" style={{ color: 'var(--accent)' }}></i>
                Explain section 1
              </button>
              <button onClick={() => onInputChange('What are the key contributions?')}>
                <i className="ph ph-star" style={{ color: 'var(--accent)' }}></i>
                Key contributions?
              </button>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : (
                    <i className="ph-fill ph-sparkle" style={{ fontSize: 14 }}></i>
                  )}
                </div>
                <div className="message-content">
                  {msg.context && (
                    <div className="message-context">
                      <span className="context-label">Highlighted</span>
                      &ldquo;{truncate(msg.context, 150)}&rdquo;
                    </div>
                  )}
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="message assistant">
                <div className="message-avatar">
                  <i className="ph-fill ph-sparkle" style={{ fontSize: 14 }}></i>
                </div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-container" onSubmit={handleSubmit}>
        {/* Context banner — shows highlighted text from the paper */}
        {selectionContext && (
          <div className="context-banner">
            <div className="context-banner-text">
              <span className="context-banner-label">Asking about:</span>
              {' '}&ldquo;{truncate(selectionContext, 120)}&rdquo;
            </div>
            <button
              type="button"
              className="context-banner-close"
              onClick={onClearContext}
            >
              &#x2715;
            </button>
          </div>
        )}
        <div className="chat-input-wrapper">
          <div className="chat-input-inner">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={
                selectionContext
                  ? 'Ask about the highlighted text...'
                  : 'Ask anything about this document...'
              }
              rows={1}
              disabled={isTyping}
            />
            <div className="chat-input-toolbar">
              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || isTyping}
              >
                <i className="ph-fill ph-paper-plane-right" style={{ fontSize: 14 }}></i>
              </button>
            </div>
          </div>
        </div>
        <div className="chat-disclaimer">
          Research Mind can make mistakes. Verify critical claims.
        </div>
      </form>
    </div>
  );
}

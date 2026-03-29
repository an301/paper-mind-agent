import { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const DUMMY_RESPONSES = [
  "I can see you've uploaded a paper. Let me help you understand it! Which section would you like to start with?",
  "That's a great question. The key insight here is that the transformer architecture replaces recurrence entirely with self-attention mechanisms, allowing for much greater parallelization during training.",
  "Let me break that down. Self-attention works by computing three vectors for each token: Query, Key, and Value. The attention score between two positions is the dot product of the Query of one position with the Key of another, scaled by the square root of the dimension.",
  "Based on what we've discussed, I think you have a solid understanding of the basics. Would you like to dive deeper into multi-head attention, or shall we move on to the next section?",
  "The paper mentions that positional encodings are added to the input embeddings to give the model information about token positions. Without this, the model would have no way to distinguish word order since self-attention is permutation-invariant.",
];

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Simulate AI response with typing delay
    const responseText = DUMMY_RESPONSES[messages.length % DUMMY_RESPONSES.length];
    const delay = 500 + Math.random() * 1000;

    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, delay);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  return (
    <div className="chat-panel">
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">?</div>
            <h3>Ask anything about your paper</h3>
            <p>Upload a research paper and start asking questions. The AI will help you understand concepts, explain equations, and identify prerequisite knowledge gaps.</p>
            <div className="suggestion-chips">
              <button onClick={() => setInput("What is this paper about?")}>
                What is this paper about?
              </button>
              <button onClick={() => setInput("Explain section 1")}>
                Explain section 1
              </button>
              <button onClick={() => setInput("What are the key contributions?")}>
                What are the key contributions?
              </button>
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div className="message-content">
                  <div className="message-role">
                    {msg.role === 'user' ? 'You' : 'Research Mind'}
                  </div>
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="message assistant">
                <div className="message-avatar">AI</div>
                <div className="message-content">
                  <div className="message-role">Research Mind</div>
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
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the paper..."
            rows={1}
            disabled={isTyping}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!input.trim() || isTyping}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14.5 1.5L7 9M14.5 1.5L10 14.5L7 9M14.5 1.5L1.5 6L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <p className="chat-disclaimer">
          AI responses are simulated. Connect the backend to get real answers.
        </p>
      </form>
    </div>
  );
}

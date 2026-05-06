import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, Bot, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { API_BASE_URL } from '../lib/contractsSchema';

const CHAT_HISTORY_LIMIT = 12;
const STARTER_MESSAGES = [
  {
    role: 'assistant',
    content:
      'Hi, I am your Contracts AI Assistant. Ask me about upload rules, multi-year logic, override steps, or Databricks contract troubleshooting.',
  },
];

function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(STARTER_MESSAGES);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messageEndRef = useRef(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !loading, [draft, loading]);

  useEffect(() => {
    if (!open) {
      return;
    }
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading, open]);

  const handleSend = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || loading) {
      return;
    }

    setError('');
    setDraft('');

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/assistant/chat`, {
        messages: nextMessages.slice(-CHAT_HISTORY_LIMIT).map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      const reply = response?.data?.reply || 'No response received from assistant.';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (requestError) {
      const details =
        requestError?.response?.data?.details ||
        requestError?.response?.data?.error ||
        requestError?.message;
      setError(details || 'Could not connect to AI assistant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`ai-widget-root ${open ? 'is-open' : ''}`}>
      {open ? (
        <section className="ai-widget-panel" aria-label="AI assistant popup">
          <header className="ai-widget-header">
            <div className="ai-widget-title-wrap">
              <span className="ai-widget-badge" aria-hidden="true">
                <Bot size={14} />
              </span>
              <div>
                <h2>AI Contracts Assistant</h2>
                <p>Instant help for upload, view, and override workflows.</p>
              </div>
            </div>
            <button
              type="button"
              className="ai-widget-close"
              onClick={() => setOpen(false)}
              aria-label="Close AI assistant"
            >
              <X size={16} />
            </button>
          </header>

          {error ? (
            <div className="ai-widget-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="ai-widget-messages" role="log" aria-live="polite">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`ai-widget-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
              >
                <p>{message.content}</p>
              </article>
            ))}

            {loading ? (
              <article className="ai-widget-bubble assistant pending">
                <p>
                  <Loader2 size={14} className="spin" /> Thinking...
                </p>
              </article>
            ) : null}
            <div ref={messageEndRef} />
          </div>

          <form className="ai-widget-input-row" onSubmit={handleSend}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about contracts..."
              disabled={loading}
            />
            <button type="submit" className="ai-widget-send" disabled={!canSend}>
              <Send size={14} />
              Send
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="ai-widget-launcher"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      >
        <MessageCircle size={18} />
        <span>AI Assistant</span>
      </button>
    </div>
  );
}

export default AiAssistantWidget;

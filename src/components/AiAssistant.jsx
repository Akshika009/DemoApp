import { useMemo, useState } from 'react';
import { AlertCircle, Bot, Loader2, Send } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../lib/contractsSchema';

const CHAT_HISTORY_LIMIT = 12;

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    content:
      'Hi, I am your Contracts AI Assistant. Ask me about upload rules, multi-year logic, override steps, or Databricks contract troubleshooting.',
  },
];

function AiAssistant() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSend = useMemo(() => draft.trim().length > 0 && !loading, [draft, loading]);

  const sendMessage = async (event) => {
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

      const reply = response?.data?.reply || 'I could not generate a response right now.';
      setMessages((current) => [...current, { role: 'assistant', content: reply }]);
    } catch (requestError) {
      const details =
        requestError?.response?.data?.details || requestError?.response?.data?.error || requestError?.message;
      setError(details || 'Could not connect to AI assistant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-enter assistant-page">
      <header className="page-header">
        <h1 className="page-title">AI Contracts Assistant</h1>
        <p className="page-subtitle">
          Ask questions about contract uploads, multi-year renewal behavior, override impact, and Databricks integration.
        </p>
      </header>

      {error ? (
        <div className="alert-banner error">
          <AlertCircle size={18} />
          <div>
            <strong>Assistant Error</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <section className="assistant-card">
        <div className="assistant-messages" role="log" aria-live="polite">
          {messages.map((message, index) => (
            <article
              key={`${message.role}-${index}`}
              className={`assistant-bubble ${message.role === 'user' ? 'user' : 'bot'}`}
            >
              <div className="assistant-bubble-head">
                {message.role === 'assistant' ? <Bot size={14} /> : null}
                <span>{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
              </div>
              <p>{message.content}</p>
            </article>
          ))}
          {loading ? (
            <article className="assistant-bubble bot pending">
              <div className="assistant-bubble-head">
                <Bot size={14} />
                <span>Assistant</span>
              </div>
              <p>
                <Loader2 size={14} className="spin" /> Thinking...
              </p>
            </article>
          ) : null}
        </div>

        <form className="assistant-input-row" onSubmit={sendMessage}>
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything about this contracts app..."
            disabled={loading}
          />
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            <Send size={16} />
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

export default AiAssistant;

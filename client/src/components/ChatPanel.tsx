import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  thinking: boolean;
  connected: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, thinking, connected, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  }

  return (
    <section className="chat-pane">
      <header className="pane-header">
        <div className="pane-title">
          <span className="pane-icon">✈️</span>
          <span>Travel-агент</span>
        </div>
        <span className={`status-pill ${connected ? 'status-ok' : 'status-off'}`}>
          {connected ? 'на связи' : 'нет соединения'}
        </span>
      </header>

      <div className="chat-messages" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble-${m.role}`}>
            {m.text}
          </div>
        ))}
        {thinking && (
          <div className="bubble bubble-assistant bubble-thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        )}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Например: подберите отель в Шанхае на выходные"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>
          Отправить
        </button>
      </form>
    </section>
  );
}

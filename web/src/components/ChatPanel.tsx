import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  disabled: boolean;
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, disabled, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, messages[messages.length - 1]?.text]);

  function submit() {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="panel-chat">
      <div className="panel-header">💬 Чат с AI-агентом</div>
      <div className="chat-messages scrollbar-thin" ref={listRef}>
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
      <div className="chat-input-row">
        <textarea
          rows={1}
          placeholder={disabled ? "Агент недоступен" : "Напишите сообщение…"}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="send-button" disabled={disabled || !draft.trim()} onClick={submit}>
          Отправить
        </button>
      </div>
    </div>
  );
}

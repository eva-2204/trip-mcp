import { useEffect, useRef, useState } from "react";
import ChatPanel from "./components/ChatPanel";
import LogsPanel from "./components/LogsPanel";
import StatusBanner from "./components/StatusBanner";
import { fetchStatus, sendChatMessage, subscribeToLogs } from "./api";
import type { ChatMessage, LogStep, StatusResponse } from "./types";

const WELCOME_TEXT =
  "Здравствуйте! Я демонстрационный AI-агент по путешествиям. Я умею искать авиабилеты и отели через MCP-серверы (Kiwi MCP и Trivago MCP). Расскажите, куда вы хотите отправиться.";

function makeSessionId(): string {
  const existing = sessionStorage.getItem("trip-mcp-session-id");
  if (existing) return existing;
  const id = crypto.randomUUID();
  sessionStorage.setItem("trip-mcp-session-id", id);
  return id;
}

export default function App() {
  const [sessionId] = useState(makeSessionId);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<LogStep[]>([]);
  const [pending, setPending] = useState(false);
  const stepsById = useRef(new Map<string, number>());

  useEffect(() => {
    fetchStatus()
      .then((s) => {
        setStatus(s);
        if (s.ready) {
          setMessages([{ id: crypto.randomUUID(), role: "assistant", text: WELCOME_TEXT }]);
        }
      })
      .catch(() => setStatus({ ready: false, model: "", kiwiUrl: "", trivagoUrl: "" }));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToLogs(sessionId, (step) => {
      setSteps((prev) => {
        const idx = stepsById.current.get(step.id);
        if (idx !== undefined) {
          const next = [...prev];
          next[idx] = step;
          return next;
        }
        stepsById.current.set(step.id, prev.length);
        return [...prev, step];
      });
    });
    return unsubscribe;
  }, [sessionId]);

  async function handleSend(text: string) {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    const pendingId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: pendingId, role: "assistant", text: "", pending: true }]);
    setPending(true);

    try {
      const { reply } = await sendChatMessage(sessionId, text);
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, text: reply, pending: false } : m)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось получить ответ агента";
      setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, text: message, pending: false } : m)));
    } finally {
      setPending(false);
    }
  }

  const ready = status?.ready ?? false;

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>
          <span className="logo-dot" aria-hidden />
          AI Travel Agent
        </h1>
      </header>

      {status && !status.ready && <StatusBanner />}

      <div className="app-body">
        <ChatPanel messages={messages} disabled={!ready || pending} onSend={handleSend} />
        <LogsPanel steps={steps} />
      </div>
    </div>
  );
}

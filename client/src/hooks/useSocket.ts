import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, McpLogEvent } from '../types';

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `m${idCounter}-${Date.now()}`;
}

interface IncomingMessage {
  type: string;
  text?: string;
  value?: boolean;
  event?: McpLogEvent;
  events?: McpLogEvent[];
}

export function useSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<McpLogEvent[]>([]);
  const [thinking, setThinking] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      let data: IncomingMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (data.type) {
        case 'welcome':
          setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: data.text ?? '' }]);
          break;
        case 'thinking':
          setThinking(Boolean(data.value));
          break;
        case 'assistant_message':
          setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', text: data.text ?? '' }]);
          break;
        case 'error':
          setMessages((prev) => [...prev, { id: nextId(), role: 'system-error', text: data.text ?? '' }]);
          break;
        case 'mcp_log':
          if (data.event) setLogs((prev) => [...prev, data.event as McpLogEvent]);
          break;
        case 'mcp_log_history':
          setLogs(data.events ?? []);
          break;
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: trimmed }]);
    wsRef.current.send(JSON.stringify({ type: 'user_message', text: trimmed }));
  }, []);

  return { messages, logs, thinking, connected, sendMessage };
}

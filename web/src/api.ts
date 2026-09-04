import type { LogStep, StatusResponse } from "./types";

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error("Не удалось получить статус сервера");
  return res.json();
}

export async function sendChatMessage(
  sessionId: string,
  message: string
): Promise<{ reply: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? "Ошибка запроса к агенту");
  }
  return body;
}

export function subscribeToLogs(sessionId: string, onStep: (step: LogStep) => void): () => void {
  const source = new EventSource(`/api/logs/stream?sessionId=${encodeURIComponent(sessionId)}`);
  source.addEventListener("log", (event) => {
    try {
      const step = JSON.parse((event as MessageEvent).data) as LogStep;
      onStep(step);
    } catch {
      // ignore malformed events
    }
  });
  return () => source.close();
}

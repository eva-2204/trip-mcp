import type { LogStep } from "../types";
import JsonViewer from "./JsonViewer";
import { EmojiIcon } from "../emoji";

// Self-hosted Twemoji SVGs (web/public/emoji) — render identically everywhere,
// unlike relying on the visitor's OS to have a color-emoji font installed.
const KIND_ICON: Record<LogStep["type"], { file: string; alt: string }> = {
  user_message: { file: "1f9d1", alt: "пользователь" },
  llm_request: { file: "1f916", alt: "LLM" },
  llm_response: { file: "1f916", alt: "LLM" },
  mcp_call: { file: "1f50c", alt: "MCP" },
  final_answer: { file: "2705", alt: "готово" },
  error: { file: "26a0", alt: "ошибка" },
};

const STATUS_LABEL: Record<LogStep["status"], string> = {
  pending: "выполняется…",
  success: "успех",
  error: "ошибка",
};

export default function LogCard({ step }: { step: LogStep }) {
  const time = new Date(step.createdAt).toLocaleTimeString("ru-RU");

  return (
    <div className={`log-card status-${step.status}`}>
      <div className="log-card-head">
        <EmojiIcon file={KIND_ICON[step.type].file} alt={KIND_ICON[step.type].alt} className="log-kind-icon" />
        <span className="log-card-title">{step.title}</span>
        {step.status === "pending" && <span className="spinner" aria-hidden />}
        <span className={`log-badge ${step.status}`}>{STATUS_LABEL[step.status]}</span>
      </div>

      <div className="log-meta">
        <span>{time}</span>
        {step.mcp?.server && (
          <span>
            сервер: <b>{step.mcp.server}</b>
          </span>
        )}
        {step.mcp?.tool && (
          <span>
            инструмент: <b>{step.mcp.tool}</b>
          </span>
        )}
        {!step.mcp?.tool && step.mcp?.method && (
          <span>
            метод: <b>{step.mcp.method}</b>
          </span>
        )}
        {typeof step.mcp?.httpStatus === "number" && step.mcp.httpStatus > 0 && (
          <span>
            HTTP: <b>{step.mcp.httpStatus}</b>
          </span>
        )}
        {step.mcp?.sessionId && (
          <span>
            session: <b>{step.mcp.sessionId.slice(0, 18)}…</b>
          </span>
        )}
        {typeof step.durationMs === "number" && (
          <span>
            время: <b>{step.durationMs} мс</b>
          </span>
        )}
      </div>

      {step.error && <div className="log-error-text">{step.error}</div>}

      <JsonViewer label="Параметры запроса" value={step.mcp?.params} />
      <JsonViewer label="Данные" value={step.data} />
      <JsonViewer label="Ответ" value={step.response} />
    </div>
  );
}

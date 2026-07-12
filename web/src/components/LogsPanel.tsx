import { useEffect, useRef } from "react";
import type { LogStep } from "../types";
import LogCard from "./LogCard";

export default function LogsPanel({ steps }: { steps: LogStep[] }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [steps.length]);

  return (
    <div className="panel-logs">
      <div className="panel-header">
        Журнал MCP-вызовов
        <span className="count-badge">{steps.length}</span>
      </div>
      <div className="pipeline-hint">
        Пользователь <span className="arrow">→</span> LLM <span className="arrow">→</span> MCP-вызов{" "}
        <span className="arrow">→</span> Ответ MCP <span className="arrow">→</span> Финальный ответ
      </div>
      <div className="log-list scrollbar-thin" ref={listRef}>
        {steps.length === 0 && (
          <div className="log-empty">
            Здесь появится подробная цепочка вызовов к Kiwi MCP и Trivago MCP: сервер, инструмент,
            параметры, ответ и время выполнения каждого запроса.
          </div>
        )}
        {steps.map((step) => (
          <LogCard key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

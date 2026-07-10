import { useEffect, useRef } from 'react';
import type { McpLogEvent } from '../types';
import { JsonBlock } from './JsonBlock';

interface LogsPanelProps {
  logs: McpLogEvent[];
}

const SERVER_LABELS: Record<string, string> = {
  kiwi: 'Kiwi',
  trivago: 'Trivago',
  claude: 'Claude',
};

const KIND_LABELS: Record<string, string> = {
  connect_start: 'Подключение',
  connect_success: 'Сессия установлена',
  connect_error: 'Ошибка подключения',
  tool_request: 'Запрос',
  tool_response: 'Ответ',
  tool_error: 'Ошибка',
  translation: 'Перевод',
  info: 'Инфо',
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour12: false });
  } catch {
    return iso;
  }
}

export function LogsPanel({ logs }: LogsPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <section className="logs-pane">
      <header className="pane-header">
        <div className="pane-title">
          <span className="pane-icon">🛰️</span>
          <span>Логи обращений к MCP</span>
        </div>
        <span className="status-pill status-neutral">{logs.length} событий</span>
      </header>

      <div className="logs-list" ref={listRef}>
        {logs.length === 0 && (
          <div className="logs-empty">Здесь появятся запросы и ответы MCP-серверов Kiwi и Trivago.</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className={`log-entry log-${log.server} log-kind-${log.kind}`}>
            <div className="log-entry-header">
              <span className={`server-badge server-badge-${log.server}`}>
                {SERVER_LABELS[log.server] ?? log.server}
              </span>
              <span className={`kind-badge kind-badge-${log.kind}`}>{KIND_LABELS[log.kind] ?? log.kind}</span>
              {log.method && <span className="method-badge">{log.method}</span>}
              <span className="log-time">{formatTime(log.timestamp)}</span>
            </div>
            <div className="log-entry-title">{log.title}</div>
            {log.payload !== undefined && <JsonBlock data={log.payload} />}
          </div>
        ))}
      </div>
    </section>
  );
}

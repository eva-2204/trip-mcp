import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export type McpServerId = 'kiwi' | 'trivago' | 'claude';

export type McpLogKind =
  | 'connect_start'
  | 'connect_success'
  | 'connect_error'
  | 'tool_request'
  | 'tool_response'
  | 'tool_error'
  | 'translation'
  | 'info';

export interface McpLogEvent {
  id: string;
  timestamp: string;
  server: McpServerId;
  serverLabel: string;
  kind: McpLogKind;
  title: string;
  method?: string;
  payload?: unknown;
}

const HISTORY_LIMIT = 300;

class LogBus extends EventEmitter {
  private history: McpLogEvent[] = [];

  emitLog(event: Omit<McpLogEvent, 'id' | 'timestamp'>): McpLogEvent {
    const full: McpLogEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.history.push(full);
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }
    this.emit('log', full);
    return full;
  }

  getHistory(): McpLogEvent[] {
    return this.history;
  }

  onLog(listener: (event: McpLogEvent) => void): () => void {
    this.on('log', listener);
    return () => this.off('log', listener);
  }
}

export const logBus = new LogBus();

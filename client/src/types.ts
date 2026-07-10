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

export type ChatRole = 'user' | 'assistant' | 'system-error';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
}

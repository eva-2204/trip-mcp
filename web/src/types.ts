export type LogStepType =
  | "user_message"
  | "llm_request"
  | "llm_response"
  | "mcp_call"
  | "final_answer"
  | "error";

export type LogStepStatus = "pending" | "success" | "error";

export interface McpCallDetails {
  server: string;
  serverUrl: string;
  method: string;
  tool?: string;
  params?: unknown;
  httpStatus?: number;
  sessionId?: string | null;
}

export interface LogStep {
  id: string;
  turnId: string;
  sequence: number;
  type: LogStepType;
  title: string;
  status: LogStepStatus;
  createdAt: string;
  durationMs?: number;
  mcp?: McpCallDetails;
  data?: unknown;
  response?: unknown;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
}

export interface StatusResponse {
  ready: boolean;
  model: string;
  kiwiUrl: string;
  trivagoUrl: string;
}

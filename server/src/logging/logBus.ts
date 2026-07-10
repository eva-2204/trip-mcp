import { randomUUID } from "node:crypto";
import type { Response } from "express";

/**
 * A single step in the agent pipeline, shown as a card in the right-hand
 * "MCP log" panel: Пользователь → LLM → MCP вызов → Ответ MCP → Финальный ответ.
 */
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

type Listener = (event: { event: string; data: LogStep }) => void;

/**
 * Very small pub/sub hub keyed by chat sessionId, used to push live log
 * events to the right-hand panel over Server-Sent Events while the agent
 * is still processing a turn.
 */
class LogBus {
  private listeners = new Map<string, Set<Listener>>();
  private sequenceBySession = new Map<string, number>();

  subscribe(sessionId: string, listener: Listener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set());
    }
    this.listeners.get(sessionId)!.add(listener);
    return () => {
      this.listeners.get(sessionId)?.delete(listener);
    };
  }

  private nextSequence(sessionId: string): number {
    const next = (this.sequenceBySession.get(sessionId) ?? 0) + 1;
    this.sequenceBySession.set(sessionId, next);
    return next;
  }

  private emit(sessionId: string, step: LogStep) {
    const set = this.listeners.get(sessionId);
    if (!set) return;
    for (const listener of set) {
      listener({ event: "log", data: step });
    }
  }

  /** Starts a new pipeline step and immediately broadcasts it in "pending" state. */
  start(
    sessionId: string,
    turnId: string,
    type: LogStepType,
    title: string,
    extra: Partial<Pick<LogStep, "mcp" | "data">> = {}
  ): LogStep {
    const step: LogStep = {
      id: randomUUID(),
      turnId,
      sequence: this.nextSequence(sessionId),
      type,
      title,
      status: "pending",
      createdAt: new Date().toISOString(),
      ...extra,
    };
    this.emit(sessionId, step);
    return step;
  }

  /** Marks a previously started step as finished (success or error) and re-broadcasts it. */
  finish(
    sessionId: string,
    step: LogStep,
    patch: Partial<Pick<LogStep, "status" | "durationMs" | "response" | "error" | "mcp">>
  ): LogStep {
    const updated: LogStep = { ...step, ...patch };
    this.emit(sessionId, updated);
    return updated;
  }

  /** Convenience for one-shot steps that don't need a pending phase (e.g. user message echo). */
  once(
    sessionId: string,
    turnId: string,
    type: LogStepType,
    title: string,
    extra: Partial<Pick<LogStep, "mcp" | "data" | "response" | "error">> = {}
  ): LogStep {
    const step = this.start(sessionId, turnId, type, title, extra);
    return this.finish(sessionId, step, { status: extra.error ? "error" : "success", durationMs: 0 });
  }
}

export const logBus = new LogBus();

/** Wires an Express response up as an SSE stream fed by the log bus for a given session. */
export function attachSseClient(sessionId: string, res: Response): () => void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`: connected\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25000);

  const unsubscribe = logBus.subscribe(sessionId, ({ event, data }) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  return () => {
    clearInterval(heartbeat);
    unsubscribe();
  };
}

/**
 * Minimal MCP "Streamable HTTP" client, implemented by hand (rather than via
 * the official SDK) so every request/response can be captured verbatim for
 * the demo's log panel: HTTP status, timing, raw params, raw body.
 *
 * Handshake observed against the real servers:
 *  - POST { method: "initialize" } -> server may reply as plain JSON or as a
 *    single SSE "message" event (`event: message\ndata: {...}`); both are
 *    handled below.
 *  - Server may return a `mcp-session-id` response header (Trivago does,
 *    Kiwi doesn't). When present it is echoed back on every later request.
 *  - A `notifications/initialized` notification is sent right after a
 *    successful initialize, per the MCP spec.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result: T;
}

export interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: number;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcFailure;

export interface McpCallResult<T = unknown> {
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  raw: unknown;
  result?: T;
  errorMessage?: string;
}

export class McpHttpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    public readonly serverName: string,
    public readonly url: string
  ) {}

  getSessionId(): string | null {
    return this.sessionId;
  }

  /** Ensures `initialize` (+ the `initialized` notification) ran exactly once. */
  async ensureInitialized(
    onCall?: (info: { method: string; params: unknown; result: McpCallResult }) => void
  ): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const params = {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "trip-mcp-demo", version: "0.1.0" },
      };
      const result = await this.rawCall("initialize", params);
      onCall?.({ method: "initialize", params, result });
      if (!result.ok) {
        throw new Error(
          `Не удалось инициализировать MCP-сервер ${this.serverName}: ${result.errorMessage ?? "неизвестная ошибка"}`
        );
      }
      // Fire-and-forget notification, required by the MCP handshake before
      // any tools/* call. Notifications carry no `id` and expect no reply body.
      await this.rawNotify("notifications/initialized", {});
      this.initialized = true;
    })();

    return this.initPromise;
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    onCall?: (info: { method: string; params: unknown; result: McpCallResult }) => void
  ): Promise<McpCallResult<T>> {
    await this.ensureInitialized(onCall);
    const params = { name, arguments: args };
    const result = await this.rawCall<T>("tools/call", params);
    onCall?.({ method: "tools/call", params, result });
    return result;
  }

  async listTools(
    onCall?: (info: { method: string; params: unknown; result: McpCallResult }) => void
  ): Promise<McpCallResult<{ tools: Array<{ name: string; [key: string]: unknown }> }>> {
    await this.ensureInitialized(onCall);
    const result = await this.rawCall<{ tools: Array<{ name: string; [key: string]: unknown }> }>(
      "tools/list",
      {}
    );
    onCall?.({ method: "tools/list", params: {}, result });
    return result;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }
    return headers;
  }

  private async rawNotify(method: string, params: unknown): Promise<void> {
    try {
      await fetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ jsonrpc: "2.0", method, params }),
      });
    } catch {
      // Notifications are best-effort; some servers don't require this step.
    }
  }

  private async rawCall<T = unknown>(method: string, params: unknown): Promise<McpCallResult<T>> {
    const id = this.nextId++;
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const startedAt = performance.now();

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      const sessionHeader = response.headers.get("mcp-session-id");
      if (sessionHeader) {
        this.sessionId = sessionHeader;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const rawText = await response.text();
      const parsed = contentType.includes("text/event-stream")
        ? parseSseJsonRpc(rawText)
        : safeJsonParse(rawText);

      const durationMs = Math.round(performance.now() - startedAt);

      if (!response.ok) {
        return {
          ok: false,
          httpStatus: response.status,
          durationMs,
          raw: parsed ?? rawText,
          errorMessage: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      if (parsed && typeof parsed === "object" && "error" in (parsed as Record<string, unknown>)) {
        const err = (parsed as JsonRpcFailure).error;
        return {
          ok: false,
          httpStatus: response.status,
          durationMs,
          raw: parsed,
          errorMessage: err?.message ?? "MCP вернул ошибку",
        };
      }

      const result = (parsed as JsonRpcSuccess<T> | undefined)?.result;
      return {
        ok: true,
        httpStatus: response.status,
        durationMs,
        raw: parsed ?? rawText,
        result,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startedAt);
      return {
        ok: false,
        httpStatus: 0,
        durationMs,
        raw: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Parses a Streamable-HTTP SSE body down to the single JSON-RPC message it carries. */
function parseSseJsonRpc(text: string): unknown {
  const dataLines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return safeJsonParse(text);
  return safeJsonParse(dataLines.join("\n"));
}

/** Extracts the plain-text payload MCP tools conventionally return as `content: [{type:"text", text}]`. */
export function extractTextContent(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  if (!Array.isArray(content)) return null;
  const textPart = content.find((part) => part.type === "text" && typeof part.text === "string");
  return textPart?.text ?? null;
}

/** Best-effort JSON.parse of the text content MCP tools return, falling back to the raw string. */
export function parseToolTextContent(result: unknown): unknown {
  const text = extractTextContent(result);
  if (text == null) return result;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

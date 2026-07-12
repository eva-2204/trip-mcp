import { McpHttpClient, extractTextContent } from "./mcpHttpClient.js";
import { logBus, type McpCallDetails } from "../logging/logBus.js";
import { enrichTrivagoPricesWithRub } from "../agent/rubEnrich.js";

export const TRIVAGO_SERVER_NAME = "Trivago MCP";

export interface HotelSearchArgs {
  /** English city/place name — translation from Russian happens upstream in the agent. */
  query: string;
  arrival: string; // YYYY-MM-DD
  departure: string; // YYYY-MM-DD
  adults?: number;
  rooms?: number;
}

export interface HotelSearchOutcome {
  ok: boolean;
  text?: string;
  errorMessage?: string;
}

/**
 * The task spec describes Trivago MCP as a strict two-step flow:
 * `trivago-search-suggestions(query)` -> `{id, ns}` -> `trivago-accommodation-search({id, ns, ...})`.
 *
 * Probing the live server (tools/list) shows its current tool set no longer
 * has a suggestions tool — `trivago-accommodation-search` now takes the
 * destination `query` directly. To keep the demo actually working against
 * the real MCP server while staying faithful to the two-step design if the
 * server ever reintroduces it, this client detects available tools once via
 * `tools/list` and adapts: uses the id/ns handshake when possible, otherwise
 * falls back to the direct query-based search.
 */
export class TrivagoMcpClient {
  private client: McpHttpClient;
  private supportsSuggestions: boolean | null = null;

  constructor(url: string) {
    this.client = new McpHttpClient(TRIVAGO_SERVER_NAME, url);
  }

  private logInitialize(sessionId: string, turnId: string, method: string, params: unknown, result: {
    ok: boolean;
    httpStatus: number;
    raw: unknown;
    errorMessage?: string;
  }) {
    logBus.once(sessionId, turnId, "mcp_call", `Trivago MCP → ${method}`, {
      mcp: {
        server: TRIVAGO_SERVER_NAME,
        serverUrl: this.client.url,
        method,
        params,
        httpStatus: result.httpStatus,
        sessionId: this.client.getSessionId(),
      } satisfies McpCallDetails,
      response: result.raw,
      error: result.ok ? undefined : result.errorMessage,
    });
  }

  private async detectToolSet(sessionId: string, turnId: string): Promise<void> {
    if (this.supportsSuggestions !== null) return;
    const listing = await this.client.listTools((info) => {
      if (info.method === "initialize") {
        this.logInitialize(sessionId, turnId, "initialize", info.params, info.result);
      }
    });
    if (!listing.ok || !listing.result) {
      // Can't determine tool set; default to the direct query-based flow,
      // which is what the live server currently supports.
      this.supportsSuggestions = false;
      return;
    }
    const names = new Set(listing.result.tools.map((t) => t.name));
    this.supportsSuggestions = names.has("trivago-search-suggestions");
  }

  async searchHotels(sessionId: string, turnId: string, args: HotelSearchArgs): Promise<HotelSearchOutcome> {
    await this.detectToolSet(sessionId, turnId);

    if (this.supportsSuggestions) {
      return this.searchViaSuggestions(sessionId, turnId, args);
    }
    return this.searchDirect(sessionId, turnId, args);
  }

  /** Two-step flow exactly as specified: suggestions(query) -> {id, ns} -> accommodation-search(id, ns, ...). */
  private async searchViaSuggestions(
    sessionId: string,
    turnId: string,
    args: HotelSearchArgs
  ): Promise<HotelSearchOutcome> {
    const suggestParams = { query: args.query };
    const suggestStep = logBus.start(
      sessionId,
      turnId,
      "mcp_call",
      `Trivago MCP → trivago-search-suggestions (${args.query})`,
      {
        mcp: {
          server: TRIVAGO_SERVER_NAME,
          serverUrl: this.client.url,
          method: "tools/call",
          tool: "trivago-search-suggestions",
          params: suggestParams,
        },
      }
    );

    const suggestResult = await this.client.callTool("trivago-search-suggestions", suggestParams);

    logBus.finish(sessionId, suggestStep, {
      status: suggestResult.ok ? "success" : "error",
      durationMs: suggestResult.durationMs,
      response: suggestResult.raw,
      error: suggestResult.ok ? undefined : suggestResult.errorMessage,
      mcp: {
        server: TRIVAGO_SERVER_NAME,
        serverUrl: this.client.url,
        method: "tools/call",
        tool: "trivago-search-suggestions",
        params: suggestParams,
        httpStatus: suggestResult.httpStatus,
        sessionId: this.client.getSessionId(),
      },
    });

    if (!suggestResult.ok) {
      return { ok: false, errorMessage: suggestResult.errorMessage ?? "Не удалось получить подсказки Trivago" };
    }

    const suggestion = extractFirstSuggestion(suggestResult.result);
    if (!suggestion) {
      return { ok: false, errorMessage: `Trivago не нашёл подходящее место для "${args.query}"` };
    }

    const searchParams = {
      id: suggestion.id,
      ns: suggestion.ns,
      arrival: args.arrival,
      departure: args.departure,
      adults: args.adults ?? 1,
      rooms: args.rooms ?? 1,
    };

    return this.callAccommodationSearch(sessionId, turnId, searchParams);
  }

  /** Fallback flow matching the live server's current tool signature (query-based, no id/ns). */
  private async searchDirect(
    sessionId: string,
    turnId: string,
    args: HotelSearchArgs
  ): Promise<HotelSearchOutcome> {
    const searchParams = {
      query: args.query,
      arrival: args.arrival,
      departure: args.departure,
      adults: args.adults ?? 1,
      rooms: args.rooms ?? 1,
    };
    return this.callAccommodationSearch(sessionId, turnId, searchParams);
  }

  private async callAccommodationSearch(
    sessionId: string,
    turnId: string,
    params: Record<string, unknown>
  ): Promise<HotelSearchOutcome> {
    const step = logBus.start(sessionId, turnId, "mcp_call", `Trivago MCP → trivago-accommodation-search`, {
      mcp: {
        server: TRIVAGO_SERVER_NAME,
        serverUrl: this.client.url,
        method: "tools/call",
        tool: "trivago-accommodation-search",
        params,
      },
    });

    const result = await this.client.callTool("trivago-accommodation-search", params, (info) => {
      if (info.method === "initialize") {
        this.logInitialize(sessionId, turnId, "initialize", info.params, info.result);
      }
    });

    logBus.finish(sessionId, step, {
      status: result.ok ? "success" : "error",
      durationMs: result.durationMs,
      response: result.raw,
      error: result.ok ? undefined : result.errorMessage,
      mcp: {
        server: TRIVAGO_SERVER_NAME,
        serverUrl: this.client.url,
        method: "tools/call",
        tool: "trivago-accommodation-search",
        params,
        httpStatus: result.httpStatus,
        sessionId: this.client.getSessionId(),
      },
    });

    if (!result.ok) {
      return { ok: false, errorMessage: result.errorMessage ?? "Неизвестная ошибка Trivago MCP" };
    }

    const text = extractTextContent(result.result) ?? JSON.stringify(result.result);
    return { ok: true, text: enrichTrivagoPricesWithRub(text) };
  }
}

function extractFirstSuggestion(result: unknown): { id: string; ns: string } | null {
  const text = extractTextContent(result);
  let parsed: unknown = result;
  if (text != null) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }
  const candidates = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { suggestions?: unknown[] })?.suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : Array.isArray((parsed as { results?: unknown[] })?.results)
        ? (parsed as { results: unknown[] }).results
        : [];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && "id" in candidate && "ns" in candidate) {
      const { id, ns } = candidate as { id: unknown; ns: unknown };
      if (typeof id === "string" && typeof ns === "string") {
        return { id, ns };
      }
    }
  }
  return null;
}

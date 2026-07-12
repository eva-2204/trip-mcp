import { McpHttpClient, extractTextContent } from "./mcpHttpClient.js";
import { isRussianAirport } from "./russianAirports.js";
import { logBus, type McpCallDetails } from "../logging/logBus.js";
import { enrichKiwiPricesWithRub } from "../agent/rubEnrich.js";

export const KIWI_SERVER_NAME = "Kiwi MCP";

export interface FlightSearchArgs {
  flyFrom: string;
  flyTo: string;
  departureDate: string; // dd/mm/yyyy, enforced below
  returnDate?: string;
  adults?: number;
  children?: number;
  infants?: number;
  cabinClass?: "M" | "W" | "C" | "F";
  currency?: string;
}

export interface FlightSearchOutcome {
  blocked?: { reason: string };
  ok: boolean;
  text?: string;
  errorMessage?: string;
}

/** Accepts ISO (yyyy-mm-dd) or already-formatted dd/mm/yyyy and returns dd/mm/yyyy, as required by Kiwi. */
export function toKiwiDate(date: string): string {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${d}/${m}/${y}`;
  }
  return date.trim();
}

export class KiwiMcpClient {
  private client: McpHttpClient;

  constructor(url: string) {
    this.client = new McpHttpClient(KIWI_SERVER_NAME, url);
  }

  async searchFlights(
    sessionId: string,
    turnId: string,
    args: FlightSearchArgs
  ): Promise<FlightSearchOutcome> {
    for (const [field, value] of [
      ["flyFrom", args.flyFrom],
      ["flyTo", args.flyTo],
    ] as const) {
      if (isRussianAirport(value)) {
        const reason = `Kiwi MCP не поддерживает российские аэропорты (обнаружено в поле "${field}": "${value}").`;
        logBus.once(sessionId, turnId, "error", "Поиск заблокирован: российский аэропорт", {
          error: reason,
        });
        return { ok: false, blocked: { reason } };
      }
    }

    const normalizedArgs: FlightSearchArgs = {
      ...args,
      departureDate: toKiwiDate(args.departureDate),
      returnDate: args.returnDate ? toKiwiDate(args.returnDate) : undefined,
    };

    const mcpBase: McpCallDetails = {
      server: KIWI_SERVER_NAME,
      serverUrl: this.client.url,
      method: "tools/call",
      tool: "search-flight",
      params: normalizedArgs,
    };

    const step = logBus.start(
      sessionId,
      turnId,
      "mcp_call",
      `Kiwi MCP → search-flight (${normalizedArgs.flyFrom} → ${normalizedArgs.flyTo})`,
      { mcp: mcpBase }
    );

    const result = await this.client.callTool("search-flight", normalizedArgs as unknown as Record<string, unknown>, (info) => {
      // Sub-step for the initialize handshake, logged inline the first time it happens.
      if (info.method === "initialize") {
        logBus.once(sessionId, turnId, "mcp_call", "Kiwi MCP → initialize", {
          mcp: {
            server: KIWI_SERVER_NAME,
            serverUrl: this.client.url,
            method: "initialize",
            params: info.params,
            httpStatus: info.result.httpStatus,
            sessionId: this.client.getSessionId(),
          },
          response: info.result.raw,
          error: info.result.ok ? undefined : info.result.errorMessage,
        });
      }
    });

    logBus.finish(sessionId, step, {
      status: result.ok ? "success" : "error",
      durationMs: result.durationMs,
      response: result.raw,
      error: result.ok ? undefined : result.errorMessage,
      mcp: { ...mcpBase, httpStatus: result.httpStatus, sessionId: this.client.getSessionId() },
    });

    if (!result.ok) {
      return { ok: false, errorMessage: result.errorMessage ?? "Неизвестная ошибка Kiwi MCP" };
    }

    const text = extractTextContent(result.result) ?? JSON.stringify(result.result);
    return { ok: true, text: enrichKiwiPricesWithRub(text) };
  }
}

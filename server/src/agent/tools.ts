import type Anthropic from '@anthropic-ai/sdk';
import { logBus } from '../logBus.js';
import {
  kiwiClient,
  KIWI_SEARCH_FLIGHT_TOOL,
  getKiwiSearchFlightSchema,
  looksLikeRussianLocation,
} from '../mcp/kiwi.js';
import {
  trivagoClient,
  TRIVAGO_SUGGESTIONS_TOOL,
  TRIVAGO_ACCOMMODATION_SEARCH_TOOL,
  getTrivagoSuggestionsSchema,
  getTrivagoAccommodationSearchSchema,
  containsCyrillic,
  translateCityNameToEnglish,
} from '../mcp/trivago.js';

export const KIWI_TOOL_NAME = 'kiwi_search_flight';
export const TRIVAGO_SUGGEST_NAME = 'trivago_search_suggestions';
export const TRIVAGO_SEARCH_NAME = 'trivago_accommodation_search';

export async function buildAgentTools(): Promise<Anthropic.Tool[]> {
  const [kiwiSchema, suggestSchema, searchSchema] = await Promise.all([
    getKiwiSearchFlightSchema(),
    getTrivagoSuggestionsSchema(),
    getTrivagoAccommodationSearchSchema(),
  ]);

  return [
    {
      name: KIWI_TOOL_NAME,
      description:
        `${kiwiSchema.description ?? 'Поиск авиабилетов через Kiwi MCP.'} ` +
        'ВАЖНО: Kiwi не поддерживает российские аэропорты — никогда не вызывай этот инструмент для рейсов ' +
        'из/в Россию, вместо этого сразу сообщи пользователю, что Kiwi не поддерживает российские аэропорты.',
      input_schema: kiwiSchema.inputSchema as Anthropic.Tool.InputSchema,
    },
    {
      name: TRIVAGO_SUGGEST_NAME,
      description:
        `${suggestSchema.description ?? 'Поиск подсказок по месту для Trivago.'} ` +
        'ВАЖНО: Trivago плохо ищет по-русски. Если пользователь назвал город по-русски, переведи ' +
        'название на английский язык сам (правильное общепринятое название) и передавай в этот инструмент только английский вариант.',
      input_schema: suggestSchema.inputSchema as Anthropic.Tool.InputSchema,
    },
    {
      name: TRIVAGO_SEARCH_NAME,
      description:
        searchSchema.description ??
        'Поиск отелей для места, найденного через trivago_search_suggestions. Используй id и ns из её ответа.',
      input_schema: searchSchema.inputSchema as Anthropic.Tool.InputSchema,
    },
  ];
}

function findRussianLocationValue(input: Record<string, unknown>): string | null {
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && looksLikeRussianLocation(value)) {
      return value;
    }
  }
  return null;
}

async function sanitizeTrivagoInput(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...input };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && containsCyrillic(value)) {
      result[key] = await translateCityNameToEnglish(value);
    }
  }
  return result;
}

export interface ToolExecutionResult {
  text: string;
  isError: boolean;
}

function resultToText(result: unknown): string {
  return JSON.stringify(result);
}

export async function executeAgentTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  if (toolName === KIWI_TOOL_NAME) {
    const blockedValue = findRussianLocationValue(input);
    if (blockedValue) {
      logBus.emitLog({
        server: 'kiwi',
        serverLabel: 'Kiwi (авиабилеты)',
        kind: 'info',
        title: 'Запрос отклонён: Kiwi не поддерживает российские аэропорты',
        method: KIWI_SEARCH_FLIGHT_TOOL,
        payload: { blockedValue, input },
      });
      return {
        isError: true,
        text:
          `Kiwi MCP не поддерживает российские аэропорты/города (обнаружено значение: "${blockedValue}"). ` +
          'Объясни пользователю, что поиск авиабилетов через Kiwi для этого направления недоступен.',
      };
    }
    const result = await kiwiClient.callTool(KIWI_SEARCH_FLIGHT_TOOL, input);
    return { isError: Boolean((result as { isError?: boolean })?.isError), text: resultToText(result) };
  }

  if (toolName === TRIVAGO_SUGGEST_NAME) {
    const safeInput = await sanitizeTrivagoInput(input);
    const result = await trivagoClient.callTool(TRIVAGO_SUGGESTIONS_TOOL, safeInput);
    return { isError: Boolean((result as { isError?: boolean })?.isError), text: resultToText(result) };
  }

  if (toolName === TRIVAGO_SEARCH_NAME) {
    const result = await trivagoClient.callTool(TRIVAGO_ACCOMMODATION_SEARCH_TOOL, input);
    return { isError: Boolean((result as { isError?: boolean })?.isError), text: resultToText(result) };
  }

  return { isError: true, text: `Неизвестный инструмент: ${toolName}` };
}

import { config } from '../config.js';
import { logBus } from '../logBus.js';
import { getOpenRouterClient } from '../agent/openrouterClient.js';
import { McpServerClient, McpToolSummary } from './client.js';

export const TRIVAGO_SUGGESTIONS_TOOL = 'trivago-search-suggestions';
export const TRIVAGO_ACCOMMODATION_SEARCH_TOOL = 'trivago-accommodation-search';

export const trivagoClient = new McpServerClient('trivago', 'Trivago (отели)', config.trivagoMcpUrl);

/** Fallback schemas, used only if live `tools/list` introspection fails. */
export const TRIVAGO_SUGGESTIONS_FALLBACK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Название города или места на английском языке (Trivago не распознаёт названия на русском)',
    },
  },
  required: ['query'],
};

export const TRIVAGO_ACCOMMODATION_SEARCH_FALLBACK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Идентификатор места, полученный из trivago-search-suggestions' },
    ns: { type: 'string', description: 'Namespace места, полученный из trivago-search-suggestions' },
    checkIn: { type: 'string', description: 'Дата заезда в формате yyyy-mm-dd' },
    checkOut: { type: 'string', description: 'Дата выезда в формате yyyy-mm-dd' },
    adults: { type: 'integer', description: 'Количество взрослых гостей', default: 2 },
    rooms: { type: 'integer', description: 'Количество номеров', default: 1 },
    currency: { type: 'string', description: "Валюта, например 'USD' или 'EUR'" },
  },
  required: ['id', 'ns', 'checkIn', 'checkOut'],
};

export async function getTrivagoSuggestionsSchema(): Promise<McpToolSummary> {
  const live = await trivagoClient.findToolSchema(TRIVAGO_SUGGESTIONS_TOOL);
  if (live) return live;
  return {
    name: TRIVAGO_SUGGESTIONS_TOOL,
    description:
      'Поиск подсказок по месту для Trivago. Возвращает id и ns, которые нужно передать в trivago-accommodation-search. Названия городов принимаются только на английском языке.',
    inputSchema: TRIVAGO_SUGGESTIONS_FALLBACK_SCHEMA,
  };
}

export async function getTrivagoAccommodationSearchSchema(): Promise<McpToolSummary> {
  const live = await trivagoClient.findToolSchema(TRIVAGO_ACCOMMODATION_SEARCH_TOOL);
  if (live) return live;
  return {
    name: TRIVAGO_ACCOMMODATION_SEARCH_TOOL,
    description: 'Поиск отелей для места, найденного через trivago-search-suggestions.',
    inputSchema: TRIVAGO_ACCOMMODATION_SEARCH_FALLBACK_SCHEMA,
  };
}

const CYRILLIC_RE = /[Ѐ-ӿ]/;

export function containsCyrillic(value: string): boolean {
  return CYRILLIC_RE.test(value);
}

/**
 * Safety net: Trivago does not resolve Russian city names. The main agent is
 * instructed to always translate city names to English itself before calling
 * Trivago tools, but in case a Cyrillic value slips through anyway, we run a
 * small dedicated LLM call (via OpenRouter) to translate it here, and log the
 * step so it's visible in the MCP log panel.
 */
export async function translateCityNameToEnglish(original: string): Promise<string> {
  const openRouter = getOpenRouterClient();
  const response = await openRouter.chat.completions.create({
    model: config.openRouterModel,
    max_tokens: 64,
    messages: [
      {
        role: 'system',
        content:
          'Ты переводчик названий городов и географических мест с русского на английский. ' +
          'Ответь только правильным английским названием места, без пояснений и кавычек.',
      },
      { role: 'user', content: original },
    ],
  });
  const translated = response.choices[0]?.message?.content?.trim();

  logBus.emitLog({
    server: 'trivago',
    serverLabel: 'Trivago (отели)',
    kind: 'translation',
    title: 'Перевод названия города через LLM (OpenRouter)',
    method: 'translate_city_name',
    payload: { original, translated },
  });

  return translated || original;
}

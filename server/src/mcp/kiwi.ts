import { config } from '../config.js';
import { McpServerClient, McpToolSummary } from './client.js';

export const KIWI_SEARCH_FLIGHT_TOOL = 'search-flight';

export const kiwiClient = new McpServerClient('kiwi', 'Kiwi (авиабилеты)', config.kiwiMcpUrl);

/**
 * Fallback JSON schema used only if the live server's `tools/list` cannot be
 * reached (e.g. no network access during local development). When Kiwi is
 * actually reachable, the real schema returned by the server is used
 * instead, see `getKiwiSearchFlightSchema`.
 */
export const KIWI_SEARCH_FLIGHT_FALLBACK_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    flyFrom: {
      type: 'string',
      description: "Город или аэропорт вылета (IATA-код или название), например 'Prague' или 'PRG'",
    },
    flyTo: {
      type: 'string',
      description: 'Город или аэропорт назначения',
    },
    dateFrom: {
      type: 'string',
      description: 'Дата вылета в формате dd/mm/yyyy',
    },
    dateTo: {
      type: 'string',
      description: 'Дата вылета (конец диапазона поиска) в формате dd/mm/yyyy, обычно равна dateFrom для точной даты',
    },
    returnFrom: {
      type: 'string',
      description: 'Дата начала обратного вылета в формате dd/mm/yyyy (только для билетов туда-обратно)',
    },
    returnTo: {
      type: 'string',
      description: 'Дата окончания обратного вылета в формате dd/mm/yyyy',
    },
    adults: { type: 'integer', description: 'Количество взрослых пассажиров', default: 1 },
    children: { type: 'integer', description: 'Количество детей' },
    infants: { type: 'integer', description: 'Количество младенцев' },
    curr: { type: 'string', description: "Валюта, например 'USD' или 'EUR'" },
  },
  required: ['flyFrom', 'flyTo', 'dateFrom'],
};

export async function getKiwiSearchFlightSchema(): Promise<McpToolSummary> {
  const live = await kiwiClient.findToolSchema(KIWI_SEARCH_FLIGHT_TOOL);
  if (live) return live;
  return {
    name: KIWI_SEARCH_FLIGHT_TOOL,
    description:
      'Поиск авиабилетов через Kiwi.com. Даты передаются в формате dd/mm/yyyy. Не поддерживает российские аэропорты.',
    inputSchema: KIWI_SEARCH_FLIGHT_FALLBACK_SCHEMA,
  };
}

const RUSSIAN_AIRPORT_CODES = [
  'svo', 'dme', 'vko', 'zia', // Moscow
  'led', // Saint Petersburg
  'aer', // Sochi
  'ovb', // Novosibirsk
  'svx', // Yekaterinburg
  'kzn', // Kazan
  'krr', // Krasnodar
  'kuf', // Samara
  'ufa', // Ufa
  'rov', // Rostov-on-Don
  'cek', // Chelyabinsk
  'pee', // Perm
  'kja', // Krasnoyarsk
  'voz', // Voronezh
  'vog', // Volgograd
  'ikt', // Irkutsk
  'vvo', // Vladivostok
  'kgd', // Kaliningrad
  'tjm', // Tyumen
  'oms', // Omsk
  'goj', // Nizhny Novgorod
  'sgc', // Surgut
];

const RUSSIAN_CITY_NAMES = [
  'москва', 'moscow', 'шереметьево', 'домодедово', 'внуково',
  'санкт-петербург', 'петербург', 'питер', 'saint petersburg', 'st petersburg', 'pulkovo', 'пулково',
  'сочи', 'sochi',
  'новосибирск', 'novosibirsk',
  'екатеринбург', 'yekaterinburg', 'ekaterinburg',
  'казань', 'kazan',
  'краснодар', 'krasnodar',
  'самара', 'samara',
  'уфа', 'ufa',
  'ростов', 'rostov',
  'челябинск', 'chelyabinsk',
  'пермь', 'perm',
  'красноярск', 'krasnoyarsk',
  'воронеж', 'voronezh',
  'волгоград', 'volgograd',
  'иркутск', 'irkutsk',
  'владивосток', 'vladivostok',
  'калининград', 'kaliningrad',
  'тюмень', 'tyumen',
  'омск', 'omsk',
  'нижний новгород', 'nizhny novgorod',
  'сургут', 'surgut',
];

const CYRILLIC_RE = /[Ѐ-ӿ]/;

/** Best-effort check whether a location string refers to a Russian airport/city. */
export function looksLikeRussianLocation(value: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (CYRILLIC_RE.test(normalized)) return true;
  if (RUSSIAN_AIRPORT_CODES.includes(normalized)) return true;
  return RUSSIAN_CITY_NAMES.some((name) => normalized.includes(name));
}

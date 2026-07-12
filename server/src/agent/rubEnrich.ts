import { config } from "../config.js";

/**
 * Appends an approximate RUB equivalent in parentheses next to every price
 * MCP tools return, deterministically, before the tool result text is handed
 * to the LLM. Doing the math here (instead of asking the LLM to compute it)
 * guarantees every price gets a consistent, correctly-rounded conversion.
 */

function rateForCurrency(code: string | undefined): number | null {
  switch ((code ?? "").toUpperCase()) {
    case "USD":
      return config.currency.usdToRub;
    case "EUR":
      return config.currency.eurToRub;
    case "RUB":
      return 1;
    default:
      return null;
  }
}

function formatRub(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU").format(Math.round(amount))} ₽`;
}

/** Extracts the leading numeric amount from a formatted price string like "72 EUR" or "$110". */
function extractAmount(priceText: string): number | null {
  const match = priceText.replace(/,/g, "").match(/[\d.]+/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function withRubSuffix(priceText: string, rate: number): string {
  if (priceText.includes("≈") || priceText.includes("₽")) return priceText;
  const amount = extractAmount(priceText);
  if (amount == null) return priceText;
  return `${priceText} (≈${formatRub(amount * rate)})`;
}

/** Kiwi search-flight result: top-level `currency`, `itineraries[].priceFormatted`. */
export function enrichKiwiPricesWithRub(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const data = parsed as { currency?: string; itineraries?: Array<{ priceFormatted?: string }> };
  const rate = rateForCurrency(data.currency);
  if (!rate || !Array.isArray(data.itineraries)) return text;

  for (const itinerary of data.itineraries) {
    if (typeof itinerary.priceFormatted === "string") {
      itinerary.priceFormatted = withRubSuffix(itinerary.priceFormatted, rate);
    }
  }

  return JSON.stringify(parsed, null, 2);
}

interface TrivagoAccommodation {
  currency?: string;
  price_per_night?: string;
  price_per_stay?: string;
}

/**
 * Trivago's tool result is `<preamble text>{"output": "<JSON-encoded array>", "system_message": ...}`
 * — the accommodation list is double-JSON-encoded inside the `output` string.
 */
export function enrichTrivagoPricesWithRub(text: string): string {
  const braceIndex = text.indexOf("{");
  if (braceIndex < 0) return text;

  const preamble = text.slice(0, braceIndex);
  let outer: unknown;
  try {
    outer = JSON.parse(text.slice(braceIndex));
  } catch {
    return text;
  }

  const outerObj = outer as { output?: string };
  if (typeof outerObj.output !== "string") return text;

  let list: TrivagoAccommodation[];
  try {
    list = JSON.parse(outerObj.output);
  } catch {
    return text;
  }
  if (!Array.isArray(list)) return text;

  for (const item of list) {
    const rate = rateForCurrency(item.currency);
    if (!rate) continue;
    if (typeof item.price_per_night === "string") {
      item.price_per_night = withRubSuffix(item.price_per_night, rate);
    }
    if (typeof item.price_per_stay === "string") {
      item.price_per_stay = withRubSuffix(item.price_per_stay, rate);
    }
  }

  outerObj.output = JSON.stringify(list);
  return preamble + JSON.stringify(outerObj, null, 2);
}

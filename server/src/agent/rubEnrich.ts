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

/**
 * Kiwi search-flight result: top-level `currency`, `itineraries[].priceFormatted`.
 * Also truncates `itineraries` to `maxResults` (Kiwi's own ordering — cheapest
 * first, per observed responses) and records `totalFound`/`shownCount` so the
 * agent can tell the user more results exist without having to count itself.
 */
export function enrichKiwiPricesWithRub(text: string, maxResults?: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const data = parsed as {
    currency?: string;
    itineraries?: Array<{ priceFormatted?: string }>;
    totalFound?: number;
    shownCount?: number;
  };
  if (!Array.isArray(data.itineraries)) return text;

  data.totalFound = data.itineraries.length;
  if (typeof maxResults === "number" && maxResults > 0 && data.itineraries.length > maxResults) {
    data.itineraries = data.itineraries.slice(0, maxResults);
  }
  data.shownCount = data.itineraries.length;

  const rate = rateForCurrency(data.currency);
  if (rate) {
    for (const itinerary of data.itineraries) {
      if (typeof itinerary.priceFormatted === "string") {
        itinerary.priceFormatted = withRubSuffix(itinerary.priceFormatted, rate);
      }
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

const SYMBOL_TO_CURRENCY: Record<string, string> = { $: "USD", "€": "EUR" };

/**
 * Even with the source data already carrying the correct RUB figure and an
 * explicit prompt instruction to copy it verbatim, an LLM can occasionally
 * mistype a multi-digit number while composing prose. Rather than trust that
 * transcription, this recomputes the ruble amount directly from whatever
 * currency amount actually appears in the model's final answer — so the
 * number shown to the user is always mathematically exact for that amount,
 * regardless of what the model wrote for the ruble part (or whether it wrote
 * one at all).
 */
export function fixRubEquivalentsInFinalText(text: string): string {
  let result = text.replace(
    /([$€])\s?(\d[\d.,]*)(\s*\(≈[^)]*\))?/g,
    (match, symbol: string, amountRaw: string) => {
      const rate = rateForCurrency(SYMBOL_TO_CURRENCY[symbol]);
      const amount = extractAmount(amountRaw);
      if (!rate || amount == null) return match;
      return `${symbol}${amountRaw} (≈${formatRub(amount * rate)})`;
    }
  );

  result = result.replace(
    /(\d[\d.,]*)\s*(USD|EUR)\b(\s*\(≈[^)]*\))?/g,
    (match, amountRaw: string, code: string) => {
      const rate = rateForCurrency(code);
      const amount = extractAmount(amountRaw);
      if (!rate || amount == null) return match;
      return `${amountRaw} ${code} (≈${formatRub(amount * rate)})`;
    }
  );

  return result;
}

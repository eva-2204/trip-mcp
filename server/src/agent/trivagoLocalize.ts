/**
 * Trivago's `trivago-accommodation-search` result embeds its own
 * `system_message` field telling the model to copy an "EXACT markdown
 * template" that is written in English (labels like "Price:", "Rating:",
 * "Amenities:", the ⭐ emoji, "View on trivago →"). Free-tier models tend to
 * follow that literal template rather than the app's own Russian-only
 * system prompt, since it's framed as a mandatory formatting instruction.
 *
 * Rather than hope the LLM translates it on the fly, this module
 * deterministically rewrites the raw MCP response before it reaches the
 * LLM: translates the `top_amenities` list via a fixed dictionary, replaces
 * the numeric star rating with a Russian words form (avoiding the ⭐ emoji,
 * which renders as a tofu box on systems without an emoji font), and swaps
 * in a Russian version of the card template.
 */

const AMENITY_TRANSLATIONS: Record<string, string> = {
  "wifi in lobby": "Wi-Fi в лобби",
  "wifi in rooms": "Wi-Fi в номерах",
  "free wifi": "бесплатный Wi-Fi",
  wifi: "Wi-Fi",
  parking: "парковка",
  "free parking": "бесплатная парковка",
  "a/c": "кондиционер",
  "air conditioning": "кондиционер",
  restaurant: "ресторан",
  "hotel bar": "бар",
  bar: "бар",
  gym: "тренажёрный зал",
  fitness: "тренажёрный зал",
  pool: "бассейн",
  "swimming pool": "бассейн",
  spa: "спа",
  pets: "можно с животными",
  "pet friendly": "можно с животными",
  "pets allowed": "можно с животными",
  kitchen: "кухня",
  kitchenette: "мини-кухня",
  "breakfast included": "завтрак включён",
  breakfast: "завтрак",
  "free cancellation": "бесплатная отмена бронирования",
  "non-smoking rooms": "номера для некурящих",
  "24-hour front desk": "круглосуточная стойка регистрации",
  "room service": "обслуживание номеров",
  laundry: "прачечная",
  elevator: "лифт",
  lift: "лифт",
  "family rooms": "семейные номера",
  "airport shuttle": "трансфер до аэропорта",
  balcony: "балкон",
  terrace: "терраса",
  garden: "сад",
  sauna: "сауна",
  "hot tub": "джакузи",
  "business center": "бизнес-центр",
  "meeting rooms": "переговорные комнаты",
};

function translateAmenity(raw: string): string {
  const key = raw.trim().toLowerCase();
  return AMENITY_TRANSLATIONS[key] ?? raw.trim();
}

function translateAmenities(topAmenities: string): string {
  return topAmenities
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(translateAmenity)
    .join(", ");
}

/** Russian words for a 1-5 hotel star rating, e.g. "4 звезды" — no emoji, so it always renders. */
export function hotelStarsInWords(rating: number): string {
  const stars = Math.round(rating);
  if (stars <= 0) return "без указанной звёздности";
  if (stars === 1) return "1 звезда";
  if (stars >= 2 && stars <= 4) return `${stars} звезды`;
  return `${stars} звёзд`;
}

const RUSSIAN_CARD_TEMPLATE = `Ты — полезный туристический ассистент. Результаты поиска отелей нужно показать пользователю напрямую, ПОЛНОСТЬЮ НА РУССКОМ ЯЗЫКЕ.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА ФОРМАТИРОВАНИЯ:
- НЕ представляй результаты в виде сравнительной таблицы или общей сводки без деталей.
- НЕ пропускай ни один отель — покажи каждый по отдельности.
- Каждый отель — отдельная визуальная карточка, одна за другой.
- Каждое поле — на отдельной строке, не объединяй несколько полей в один абзац.
- НИКОГДА не используй эмодзи звёзд (⭐ или ★) — на некоторых устройствах они отображаются как нечитаемый квадрат. Вместо этого используй готовую текстовую классификацию из поля hotel_class_ru (например «4 звезды»), она уже на русском.
- Значение поля top_amenities уже переведено на русский — используй его как есть, не переводи заново и не оставляй остатки английских слов.

Для КАЖДОГО отеля используй ТОЧНО такой markdown-шаблон (одно поле на строку, пустые строки между блоками):

---

![Название отеля](main_image)

### Название отеля

**Цена:** price_per_stay / price_per_night

**Рейтинг:** hotel_class_ru | review_rating (review_count отзывов)

**Удобства:** top_amenities

[Смотреть на trivago →](accommodation_url)

---

После перечисления ВСЕХ отелей добавь краткое резюме, тоже полностью на русском:
1. **Итог** — что нашлось (например: «Нашёл 8 отелей в центре Берлина на ваши даты, от 65 до 210 евро за ночь»).
2. **Особенности** — 2-3 лучших варианта и почему (лучшая цена, самый высокий рейтинг, лучшее расположение, уникальные удобства).
3. **Советы** — если уместно, предложи фильтры или изменения поиска.`;

interface TrivagoAccommodation {
  hotel_rating?: number;
  top_amenities?: string;
  hotel_class_ru?: string;
}

export function localizeTrivagoResult(text: string): string {
  const braceIndex = text.indexOf("{");
  if (braceIndex < 0) return text;

  const preamble = text.slice(0, braceIndex);
  let outer: unknown;
  try {
    outer = JSON.parse(text.slice(braceIndex));
  } catch {
    return text;
  }

  const outerObj = outer as { output?: string; system_message?: string };
  if (typeof outerObj.output !== "string") return text;

  let list: TrivagoAccommodation[];
  try {
    list = JSON.parse(outerObj.output);
  } catch {
    return text;
  }
  if (!Array.isArray(list)) return text;

  for (const item of list) {
    if (typeof item.top_amenities === "string") {
      item.top_amenities = translateAmenities(item.top_amenities);
    }
    if (typeof item.hotel_rating === "number") {
      item.hotel_class_ru = hotelStarsInWords(item.hotel_rating);
    }
  }

  outerObj.output = JSON.stringify(list);
  outerObj.system_message = RUSSIAN_CARD_TEMPLATE;

  return preamble + JSON.stringify(outerObj, null, 2);
}

/**
 * Some models keep the English "View on trivago →" link label out of a
 * strong training-data habit even when explicitly given a Russian template
 * to copy. Rather than depend further on prompt compliance, this targets
 * only the bracketed link-text portion of the markdown link (never the URL
 * that follows in parentheses), so it can't accidentally corrupt a link.
 */
export function fixTrivagoLinkLabel(text: string): string {
  return text.replace(/\[\s*View\s+on\s+trivago\s*(→)?\s*\]/gi, "[Смотреть на trivago →]");
}

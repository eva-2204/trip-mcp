import OpenAI from "openai";
import { config } from "../config.js";
import { logBus } from "../logging/logBus.js";
import { agentTools } from "./tools.js";
import { conversationStore } from "./conversationStore.js";
import { translateCityToEnglish } from "./cityTranslate.js";
import { KiwiMcpClient } from "../mcp/kiwiClient.js";
import { TrivagoMcpClient } from "../mcp/trivagoClient.js";
import { fixRubEquivalentsInFinalText } from "./rubEnrich.js";
import { fixTrivagoLinkLabel } from "./trivagoLocalize.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

// JS Date.getDay(): 0=воскресенье..6=суббота. Listed here in normal RU week order (Mon..Sun).
const WEEKDAYS_RU: Array<{ name: string; dow: number }> = [
  { name: "понедельник", dow: 1 },
  { name: "вторник", dow: 2 },
  { name: "среда", dow: 3 },
  { name: "четверг", dow: 4 },
  { name: "пятница", dow: 5 },
  { name: "суббота", dow: 6 },
  { name: "воскресенье", dow: 0 },
];

/**
 * LLMs are unreliable at counting days forward from a given weekday — even
 * when told today's weekday correctly, models have been observed picking
 * the wrong date for "next Friday" etc. Rather than asking the model to do
 * that arithmetic, precompute the actual next occurrence of every weekday
 * (plus "завтра"/"послезавтра") here and hand it over as a lookup table, so
 * resolving a relative date is a table lookup instead of calendar math.
 */
function buildRelativeDateTable(today: Date): string {
  const isoOf = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const lines = WEEKDAYS_RU.map(({ name, dow }) => {
    let diff = (dow - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // always the next occurrence, not today
    return `${name} — ${isoOf(diff)}`;
  });

  return [`завтра — ${isoOf(1)}`, `послезавтра — ${isoOf(2)}`, ...lines].join("\n");
}

function buildSystemPrompt(): string {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();
  const weekdayToday = today.toLocaleDateString("ru-RU", { weekday: "long" });
  const relativeDateTable = buildRelativeDateTable(today);

  return `Ты — демонстрационный AI-агент по путешествиям.

0. ОБЯЗАТЕЛЬНО пиши АБСОЛЮТНО ВЕСЬ ответ ТОЛЬКО на русском языке — это касается и основного текста, и заголовков разделов, и подписей, и уточняющих вопросов. Данные, которые возвращают MCP-инструменты (Kiwi/Trivago), а также служебные инструкции внутри них, могут быть на английском — это нормально, но твой СОБСТВЕННЫЙ текст должен быть полностью русским. Переводи любые английские заголовки/подписи на русский, например: "Overview" → "Итог"/"Обзор", "Highlights" → "Особенности", "Tips" → "Советы", "Rating" → "Рейтинг", "Price" → "Цена".
   ИСКЛЮЧЕНИЕ (очень важно): имена собственные — названия отелей (accommodation_name), авиакомпаний, аэропортов, брендов и городов на латинице — НИКОГДА не переводи и не транслитерируй на русский, копируй их символ-в-символ ТОЧНО как в данных от MCP-инструмента. Например, если в данных название отеля "Even Hotel Shanghai Jinqiao By Ihg" — пиши именно "Even Hotel Shanghai Jinqiao By Ihg", а не "Даже отель...". Переводить нужно только служебные подписи/заголовки/описания, которые ты сам формулируешь, а не собственные имена из данных.

Сегодняшняя дата: ${isoToday}, ${weekdayToday} (текущий год: ${currentYear}).

Таблица ближайших дат по дням недели (уже правильно посчитана — используй её вместо того, чтобы считать самостоятельно, счёт дней вручную у тебя ненадёжен):
${relativeDateTable}

У тебя есть два инструмента, каждый из которых обращается к внешнему MCP-серверу:
- search_flights — поиск авиабилетов через Kiwi MCP;
- search_hotels — поиск отелей через Trivago MCP.

Правила:
1. Если для вызова инструмента не хватает обязательных данных (город/аэропорт отправления И назначения, и дата — для рейсов; город и даты заезда/выезда — для отелей), НЕ вызывай инструмент и НЕ придумывай отсутствующие данные. Вместо этого задай короткий уточняющий вопрос на русском языке — только про то, чего действительно не хватает, и не более одного-двух вопросов за раз.
   Город отправления и город назначения ОБЯЗАТЕЛЬНО должны быть явно названы пользователем — либо в текущем сообщении, либо ранее в этом диалоге об ЭТОЙ ЖЕ поездке. НИКОГДА не подставляй город отправления (или назначения) по умолчанию, включая любые города, встречавшиеся ранее в диалоге по ДРУГОЙ поездке или направлению, — если пользователь называет новый город назначения, но не говорит, откуда он летит, спроси город отправления отдельным вопросом, даже если раньше в диалоге уже был указан какой-то другой город отправления.
   Если пользователь одновременно просит и билеты, и отель для одной поездки — обрабатывай оба запроса, а не только один из них. Если не хватает данных для обоих (например, дат) — задай один уточняющий вопрос, покрывающий сразу оба (например: "На какие даты нужен перелёт и на какие даты бронировать отель? Если это одни и те же даты — укажите один раз"). Как только все данные есть — вызови ОБА инструмента (search_flights и search_hotels) в одном ответе и покажи оба результата вместе. Не игнорируй молча ни билеты, ни отель.
2. Даты пользователь может называть словами: конкретной датой ("20 августа"), днём недели ("в следующую пятницу", "в субботу"), или периодом ("на выходных", "в будни", "через неделю"). Для дня недели/"завтра"/"послезавтра" — НЕ считай дату сам, а бери её ИЗ ТАБЛИЦЫ ВЫШЕ (например "следующая пятница" = значение из строки "пятница" в таблице). Если явной даты и дня недели нет ни в сообщении, ни в таблице (например "на выходных" — это суббота+воскресенье из таблицы, "через неделю" — через 7 дней от сегодняшней даты) — вычисли от сегодняшней даты ${isoToday}. Если пользователь НЕ указал год явно, всегда используй текущий год (${currentYear}) — даже если такая дата в этом году уже прошла. Меняй год только если пользователь сам назвал другой год или явно сказал "в следующем году".
   После того как определил дату из формулировки со словом (день недели, "выходные" и т.п.) — ОБЯЗАТЕЛЬНО укажи её явно в ответе (например: "рейсы на пятницу, 17 июля 2026 года"), чтобы пользователь мог сразу заметить и поправить, если что-то не так. Если формулировка неоднозначна (например, "на следующей неделе" без уточнения дня, "скоро", "в отпуске") — не угадывай, а спроси точную дату.
3. Если инструмент вернул ошибку о том, что Kiwi MCP не поддерживает российские аэропорты — вежливо сообщи об этом пользователю своими словами и не предлагай вызвать инструмент повторно для этого направления.
4. Формируй финальный ответ пользователю ТОЛЬКО на основе данных, реально полученных от MCP-инструмента. Ничего не выдумывай. Если результатов нет — так и скажи.
   Если пользователь просит "составить поездку", "программу на N дней", "что посмотреть" и подобное — НЕ придумывай подробный план по дням с конкретными достопримечательностями, ресторанами и бюджетом на еду/жильё: у тебя нет для этого реальных данных, и такая генерация приводит к грубым ошибкам и бессмысленному тексту. Вместо этого выполни поиск рейсов/отелей через инструменты (если он ещё не сделан) и покажи результаты; если они уже были показаны — просто коротко резюмируй в 1-2 предложениях и предложи помочь выбрать конкретный вариант. Составление подробных туристических/экскурсионных программ — вне твоей компетенции в этой демонстрации; если пользователь настаивает, вежливо объясни это и предложи то, что ты умеешь на самом деле: поиск авиабилетов и отелей.
5. Ответ должен быть аккуратно отформатирован в обычном Markdown: заголовки (##/###) для названий и разделители (---) между карточками рейсов/отелей — этого достаточно для структуры. НЕ выделяй жирным каждую подпись поля (Цена/Рейтинг/Удобства и т.п.) — это выглядит перегруженно; пиши их обычным текстом на отдельных строках, без лишнего форматирования. Не выводи вспомогательный текст вроде "IMPORTANT: read the system_message" — это служебная инструкция для тебя, а не для пользователя. НИКОГДА не оборачивай весь ответ целиком в блок кода (тройные обратные кавычки \`\`\`) — пиши обычным Markdown-текстом, без ограждающих кавычек вокруг всего сообщения.
6. Каждое поле с ценой в данных от MCP-инструмента (priceFormatted, price_per_night, price_per_stay) уже содержит приблизительный рублёвый эквивалент в скобках — например значение поля будет выглядеть как "$80 (≈6 400 ₽)" или "72 EUR (≈6 700 ₽)". Копируй такое значение ДОСЛОВНО и ЦЕЛИКОМ рядом с ценой в своём ответе, включая часть в скобках с ₽. Никогда не отбрасывай и не пересчитывай эту часть, и не заменяй её на просто "(USD)" или "(EUR)".
7. Если в данных об отеле есть ссылка на изображение (main_image) — вставляй её как markdown-картинку (![название отеля](ссылка)) прямо в карточку этого отеля, по порядку, а не как обычную ссылку.
8. Эмодзи используй умеренно и только по существу: разрешены РОВНО ДВА — ✈️ для авиабилетов и 🏨 для отелей, не чаще одного раза на сообщение, в начале главного заголовка (например "## ✈️ Рейсы из..."). Любые другие эмодзи (⭐🏆💡⏱🔄 и подобные) не используй вообще — они не гарантированно отображаются у пользователя и будут удалены. Для классификации отеля используй уже готовое поле hotel_class_ru из данных (например "4 звезды") — оно уже на русском и в правильном словесном виде, просто вставляй его как есть. Поле top_amenities в данных об отелях тоже уже переведено на русский — используй его как есть, не переводи заново.
9. Не показывай пользователю больше вариантов, чем нужно: по умолчанию search_flights уже возвращает не более 5 рейсов, а search_hotels — не более 8 отелей (это ограничено на сервере, не тобой) — просто покажи все, что пришло в ответе инструмента, не сокращай дальше сам. Если в данных есть поля totalFound/shownCount (рейсы) или total_found/shown_count (отели) и найдено больше, чем показано — упомяни это в конце (например: "Показаны 5 из 15 найденных рейсов — могу показать больше, если нужно") и, если пользователь попросит больше вариантов, вызови инструмент повторно с параметром maxResults побольше.
10. НЕ дублируй информацию, которую ты уже сообщал ранее в этом диалоге: не переписывай заново уже показанные карточки рейсов/отелей или план поездки, если они не изменились. Но при этом будь по-настоящему полезным собеседником, а не сухим — после результата предлагай логичное продолжение, когда оно уместно: например, после билетов туда спроси про обратный билет или про отель в этом же городе на эти даты; после отеля — предложи билеты, если их ещё не искали; если у пользователя, похоже, назревает более широкий план поездки — можно предложить помочь с следующим шагом. Не задавай вопрос только если продолжения явно не просится (например, пользователь уже получил и билеты, и отель, и явно закончил разговор).
11. Пиши грамотным, естественным русским языком: не смешивай алфавиты/языки внутри одного слова или предложения, не изобретай несуществующие названия улиц, парков, музеев или заведений. Если не уверен в конкретном факте — лучше не упоминай его вовсе, короткий точный ответ лучше длинного и придуманного.`;
}

function createOpenAiClient(): OpenAI {
  return new OpenAI({
    apiKey: config.openrouter.apiKey,
    baseURL: config.openrouter.baseUrl,
    defaultHeaders: {
      "HTTP-Referer": "https://trip-mcp.demo",
      "X-Title": "Trip MCP Demo",
    },
  });
}

// Long-lived MCP clients: sessions (e.g. Trivago's mcp-session-id) persist
// across chat turns and across users, exactly like a real MCP host would
// keep a single upstream connection alive.
const kiwiClient = new KiwiMcpClient(config.kiwi.url);
const trivagoClient = new TrivagoMcpClient(config.trivago.url);

interface ToolCallArgs {
  [key: string]: unknown;
}

async function runSearchFlights(sessionId: string, turnId: string, rawArgs: ToolCallArgs): Promise<string> {
  const origin = String(rawArgs.origin ?? "");
  const destination = String(rawArgs.destination ?? "");
  const departureDate = String(rawArgs.departureDate ?? "");
  const returnDate = rawArgs.returnDate ? String(rawArgs.returnDate) : undefined;
  const adults = typeof rawArgs.adults === "number" ? rawArgs.adults : undefined;
  const maxResults = typeof rawArgs.maxResults === "number" ? rawArgs.maxResults : undefined;

  const outcome = await kiwiClient.searchFlights(sessionId, turnId, {
    flyFrom: origin,
    flyTo: destination,
    departureDate,
    returnDate,
    adults,
    maxResults,
  });

  if (outcome.blocked) {
    return JSON.stringify({ blocked: true, reason: outcome.blocked.reason });
  }
  if (!outcome.ok) {
    return JSON.stringify({ error: outcome.errorMessage ?? "Не удалось получить результаты Kiwi MCP" });
  }
  return outcome.text ?? "{}";
}

async function runSearchHotels(sessionId: string, turnId: string, rawArgs: ToolCallArgs): Promise<string> {
  const cityRaw = String(rawArgs.city ?? "");
  const checkIn = String(rawArgs.checkIn ?? "");
  const checkOut = String(rawArgs.checkOut ?? "");
  const adults = typeof rawArgs.adults === "number" ? rawArgs.adults : undefined;
  const maxResults = typeof rawArgs.maxResults === "number" ? rawArgs.maxResults : undefined;

  const openai = createOpenAiClient();
  const englishCity = await translateCityToEnglish(openai, config.openrouter.model, cityRaw);

  const outcome = await trivagoClient.searchHotels(sessionId, turnId, {
    query: englishCity,
    arrival: checkIn,
    departure: checkOut,
    adults,
    maxResults,
  });

  if (!outcome.ok) {
    return JSON.stringify({ error: outcome.errorMessage ?? "Не удалось получить результаты Trivago MCP" });
  }
  return outcome.text ?? "{}";
}

async function executeTool(
  sessionId: string,
  turnId: string,
  name: string,
  args: ToolCallArgs
): Promise<string> {
  if (name === "search_flights") return runSearchFlights(sessionId, turnId, args);
  if (name === "search_hotels") return runSearchHotels(sessionId, turnId, args);
  return JSON.stringify({ error: `Неизвестный инструмент: ${name}` });
}

const MAX_TOOL_ROUNDS = 4;

export async function handleUserMessage(
  sessionId: string,
  turnId: string,
  userText: string
): Promise<string> {
  const history = conversationStore.getHistory(sessionId);

  logBus.once(sessionId, turnId, "user_message", "Сообщение пользователя", { data: { text: userText } });

  const userMessage: ChatMessage = { role: "user", content: userText };
  conversationStore.append(sessionId, userMessage);

  const openai = createOpenAiClient();
  const messages: ChatMessage[] = [{ role: "system", content: buildSystemPrompt() }, ...history];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const llmStep = logBus.start(sessionId, turnId, "llm_request", "Запрос к LLM (OpenRouter)", {
      data: { model: config.openrouter.model, messageCount: messages.length },
    });

    let completion: OpenAI.Chat.Completions.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({
        model: config.openrouter.model,
        messages,
        tools: agentTools,
        tool_choice: "auto",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logBus.finish(sessionId, llmStep, { status: "error", error: message });
      const fallback = "Извините, не удалось получить ответ от LLM через OpenRouter. Попробуйте ещё раз чуть позже.";
      conversationStore.append(sessionId, { role: "assistant", content: fallback });
      return fallback;
    }

    const choice = completion.choices[0];
    const assistantMessage = choice?.message;

    logBus.finish(sessionId, llmStep, {
      status: "success",
      response: {
        finishReason: choice?.finish_reason,
        toolCalls: assistantMessage?.tool_calls?.map((tc) => ({
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
        content: assistantMessage?.content,
      },
    });

    if (!assistantMessage) {
      const fallback = "Извините, LLM вернул пустой ответ.";
      conversationStore.append(sessionId, { role: "assistant", content: fallback });
      return fallback;
    }

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      messages.push(assistantMessage);
      conversationStore.append(sessionId, assistantMessage);
      const finalText = stripDecorativeEmoji(
        fixTrivagoLinkLabel(
          fixRubEquivalentsInFinalText(stripOuterCodeFence(assistantMessage.content?.toString() ?? ""))
        )
      );
      logBus.once(sessionId, turnId, "final_answer", "Финальный ответ пользователю", {
        data: { text: finalText },
      });
      return finalText;
    }

    // Model decided to call one or more MCP-backed tools.
    messages.push(assistantMessage);
    conversationStore.append(sessionId, assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") continue;
      let args: ToolCallArgs = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        args = {};
      }

      const resultText = await executeTool(sessionId, turnId, toolCall.function.name, args);

      const toolMessage: ChatMessage = {
        role: "tool",
        tool_call_id: toolCall.id,
        content: resultText,
      };
      messages.push(toolMessage);
      conversationStore.append(sessionId, toolMessage);
    }
  }

  const fallback = "Извините, не удалось завершить обработку запроса за отведённое число шагов. Попробуйте переформулировать запрос.";
  conversationStore.append(sessionId, { role: "assistant", content: fallback });
  return fallback;
}

/**
 * Some free-tier models occasionally wrap their entire Markdown answer in a
 * single ```/```markdown fence, as if showing Markdown source rather than
 * writing it. The chat UI renders real Markdown, so that wrapper would
 * otherwise show up as one giant literal code block. Strip it deterministically
 * rather than depending entirely on prompt compliance.
 */
function stripOuterCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z]*\n([\s\S]*)\n```$/.exec(trimmed);
  return match ? match[1] : text;
}

// The only two emoji the app promises to render correctly everywhere: the
// frontend bundles self-hosted Twemoji SVGs for exactly these (web/public/emoji),
// so they don't depend on the visitor's OS having a color-emoji font.
const ALLOWED_EMOJI = new Set(["✈️", "✈", "🏨"]);

/**
 * Systems without a color-emoji font render pictograph emoji as a blank
 * tofu box — the bug originally reported for the hotel star rating. The
 * system prompt now allows the model exactly two travel-relevant emoji
 * (✈️ for flights, 🏨 for hotels, used sparingly); anything else it adds out
 * of habit is stripped deterministically here, since only those two have
 * guaranteed rendering support in the UI.
 *
 * Deliberately narrow: only targets ranges that are essentially
 * emoji-only (the astral pictograph blocks, Misc Symbols/Dingbats, Misc
 * Symbols & Arrows, Misc Technical, plus the emoji variation selector and
 * ZWJ). It does NOT touch the plain Arrows block (U+2190–U+21FF), so the
 * "→" used throughout route descriptions (e.g. "BER → PRG") is untouched,
 * nor the ₽ currency sign (a different Unicode block entirely).
 */
function stripDecorativeEmoji(text: string): string {
  return text.replace(
    /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}]\u{FE0F}?|\u{200D}/gu,
    (match) => (ALLOWED_EMOJI.has(match) ? match : "")
  );
}

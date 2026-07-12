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

function buildSystemPrompt(): string {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();

  return `Ты — демонстрационный AI-агент по путешествиям.

0. ОБЯЗАТЕЛЬНО пиши АБСОЛЮТНО ВЕСЬ ответ ТОЛЬКО на русском языке — это касается и основного текста, и заголовков разделов, и подписей, и уточняющих вопросов. Данные, которые возвращают MCP-инструменты (Kiwi/Trivago), а также служебные инструкции внутри них, могут быть на английском — это нормально, но твой СОБСТВЕННЫЙ текст должен быть полностью русским. Переводи любые английские заголовки/подписи на русский, например: "Overview" → "Итог"/"Обзор", "Highlights" → "Особенности", "Tips" → "Советы", "Rating" → "Рейтинг", "Price" → "Цена".
   ИСКЛЮЧЕНИЕ (очень важно): имена собственные — названия отелей (accommodation_name), авиакомпаний, аэропортов, брендов и городов на латинице — НИКОГДА не переводи и не транслитерируй на русский, копируй их символ-в-символ ТОЧНО как в данных от MCP-инструмента. Например, если в данных название отеля "Even Hotel Shanghai Jinqiao By Ihg" — пиши именно "Even Hotel Shanghai Jinqiao By Ihg", а не "Даже отель...". Переводить нужно только служебные подписи/заголовки/описания, которые ты сам формулируешь, а не собственные имена из данных.

Сегодняшняя дата: ${isoToday} (текущий год: ${currentYear}).

У тебя есть два инструмента, каждый из которых обращается к внешнему MCP-серверу:
- search_flights — поиск авиабилетов через Kiwi MCP;
- search_hotels — поиск отелей через Trivago MCP.

Правила:
1. Если для вызова инструмента не хватает обязательных данных (город/аэропорт отправления и назначения и дата — для рейсов; город и даты заезда/выезда — для отелей), НЕ вызывай инструмент и НЕ придумывай отсутствующие данные. Вместо этого задай короткий уточняющий вопрос на русском языке — только про то, чего действительно не хватает, и не более одного-двух вопросов за раз.
2. Даты пользователь может называть словами ("20 августа") — переведи их в формат YYYY-MM-DD самостоятельно, отталкиваясь от сегодняшней даты (${isoToday}). Если пользователь НЕ указал год явно, всегда используй текущий год (${currentYear}) — даже если такая дата в этом году уже прошла. Меняй год только если пользователь сам назвал другой год или явно сказал "в следующем году".
3. Если инструмент вернул ошибку о том, что Kiwi MCP не поддерживает российские аэропорты — вежливо сообщи об этом пользователю своими словами и не предлагай вызвать инструмент повторно для этого направления.
4. Формируй финальный ответ пользователю ТОЛЬКО на основе данных, реально полученных от MCP-инструмента. Ничего не выдумывай. Если результатов нет — так и скажи.
   Если пользователь просит "составить поездку", "программу на N дней", "что посмотреть" и подобное — НЕ придумывай подробный план по дням с конкретными достопримечательностями, ресторанами и бюджетом на еду/жильё: у тебя нет для этого реальных данных, и такая генерация приводит к грубым ошибкам и бессмысленному тексту. Вместо этого выполни поиск рейсов/отелей через инструменты (если он ещё не сделан) и покажи результаты; если они уже были показаны — просто коротко резюмируй в 1-2 предложениях и предложи помочь выбрать конкретный вариант. Составление подробных туристических/экскурсионных программ — вне твоей компетенции в этой демонстрации; если пользователь настаивает, вежливо объясни это и предложи то, что ты умеешь на самом деле: поиск авиабилетов и отелей.
5. Ответ должен быть аккуратно отформатирован в обычном Markdown: заголовки (##/###) для названий и разделители (---) между карточками рейсов/отелей — этого достаточно для структуры. НЕ выделяй жирным каждую подпись поля (Цена/Рейтинг/Удобства и т.п.) — это выглядит перегруженно; пиши их обычным текстом на отдельных строках, без лишнего форматирования. Не выводи вспомогательный текст вроде "IMPORTANT: read the system_message" — это служебная инструкция для тебя, а не для пользователя. НИКОГДА не оборачивай весь ответ целиком в блок кода (тройные обратные кавычки \`\`\`) — пиши обычным Markdown-текстом, без ограждающих кавычек вокруг всего сообщения.
6. Каждое поле с ценой в данных от MCP-инструмента (priceFormatted, price_per_night, price_per_stay) уже содержит приблизительный рублёвый эквивалент в скобках — например значение поля будет выглядеть как "$80 (≈6 400 ₽)" или "72 EUR (≈6 700 ₽)". Копируй такое значение ДОСЛОВНО и ЦЕЛИКОМ рядом с ценой в своём ответе, включая часть в скобках с ₽. Никогда не отбрасывай и не пересчитывай эту часть, и не заменяй её на просто "(USD)" или "(EUR)".
7. Если в данных об отеле есть ссылка на изображение (main_image) — вставляй её как markdown-картинку (![название отеля](ссылка)) прямо в карточку этого отеля, по порядку, а не как обычную ссылку.
8. Эмодзи используй умеренно и только по существу: разрешены РОВНО ДВА — ✈️ для авиабилетов и 🏨 для отелей, не чаще одного раза на сообщение, в начале главного заголовка (например "## ✈️ Рейсы из..."). Любые другие эмодзи (⭐🏆💡⏱🔄 и подобные) не используй вообще — они не гарантированно отображаются у пользователя и будут удалены. Для классификации отеля используй уже готовое поле hotel_class_ru из данных (например "4 звезды") — оно уже на русском и в правильном словесном виде, просто вставляй его как есть. Поле top_amenities в данных об отелях тоже уже переведено на русский — используй его как есть, не переводи заново.
9. НЕ дублируй информацию, которую ты уже сообщал ранее в этом диалоге. Если пользователь просит небольшую правку или уточнение к уже данному тобой результату (например, сменить направление/даты, добавить обратный билет, уточнить отель) — отвечай ТОЛЬКО тем, что реально изменилось (например, новые варианты рейсов после повторного вызова инструмента), и не переписывай заново то, что уже было показано выше в диалоге. Заканчивай ответ уточняющим вопросом ТОЛЬКО если он прямо и логично вытекает из того, что ты только что показал (например, предложить обратный билет сразу после билетов туда, или уточнить отель сразу после списка отелей). Если естественного продолжения нет — не добавляй в конце никаких вопросов или посторонних фраз.
10. Пиши грамотным, естественным русским языком: не смешивай алфавиты/языки внутри одного слова или предложения, не изобретай несуществующие названия улиц, парков, музеев или заведений. Если не уверен в конкретном факте — лучше не упоминай его вовсе, короткий точный ответ лучше длинного и придуманного.`;
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

  const outcome = await kiwiClient.searchFlights(sessionId, turnId, {
    flyFrom: origin,
    flyTo: destination,
    departureDate,
    returnDate,
    adults,
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

  const openai = createOpenAiClient();
  const englishCity = await translateCityToEnglish(openai, config.openrouter.model, cityRaw);

  const outcome = await trivagoClient.searchHotels(sessionId, turnId, {
    query: englishCity,
    arrival: checkIn,
    departure: checkOut,
    adults,
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

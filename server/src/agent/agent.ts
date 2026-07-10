import OpenAI from "openai";
import { config } from "../config.js";
import { logBus } from "../logging/logBus.js";
import { agentTools } from "./tools.js";
import { conversationStore } from "./conversationStore.js";
import { translateCityToEnglish } from "./cityTranslate.js";
import { KiwiMcpClient } from "../mcp/kiwiClient.js";
import { TrivagoMcpClient } from "../mcp/trivagoClient.js";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function buildSystemPrompt(): string {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const currentYear = today.getFullYear();

  return `Ты — демонстрационный AI-агент по путешествиям. Ты общаешься с пользователем ТОЛЬКО на русском языке.

Сегодняшняя дата: ${isoToday} (текущий год: ${currentYear}).

У тебя есть два инструмента, каждый из которых обращается к внешнему MCP-серверу:
- search_flights — поиск авиабилетов через Kiwi MCP;
- search_hotels — поиск отелей через Trivago MCP.

Правила:
1. Если для вызова инструмента не хватает обязательных данных (город/аэропорт отправления и назначения и дата — для рейсов; город и даты заезда/выезда — для отелей), НЕ вызывай инструмент и НЕ придумывай отсутствующие данные. Вместо этого задай короткий уточняющий вопрос — только про то, чего действительно не хватает, и не более одного-двух вопросов за раз.
2. Даты пользователь может называть словами ("20 августа") — переведи их в формат YYYY-MM-DD самостоятельно, отталкиваясь от сегодняшней даты (${isoToday}). Если пользователь НЕ указал год явно, всегда используй текущий год (${currentYear}) — даже если такая дата в этом году уже прошла. Меняй год только если пользователь сам назвал другой год или явно сказал "в следующем году".
3. Если инструмент вернул ошибку о том, что Kiwi MCP не поддерживает российские аэропорты — вежливо сообщи об этом пользователю своими словами и не предлагай вызвать инструмент повторно для этого направления.
4. Формируй финальный ответ пользователю ТОЛЬКО на основе данных, реально полученных от MCP-инструмента. Ничего не выдумывай. Если результатов нет — так и скажи.
5. Отвечай живым, дружелюбным языком, структурируй списки билетов/отелей читаемо (например, маркированным списком: направление/цена/детали).`;
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
      const finalText = assistantMessage.content?.toString() ?? "";
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

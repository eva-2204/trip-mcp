import type OpenAI from "openai";

/**
 * Tool schemas exposed to the LLM via OpenRouter's OpenAI-compatible
 * Chat Completions API (tools / tool_choice). Required fields are kept to
 * the strict minimum needed to actually call the underlying MCP tool, so
 * the model is forced to ask the user for anything missing instead of
 * guessing (reinforced by the system prompt).
 */
export const agentTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description:
        "Искать авиабилеты через Kiwi MCP между двумя городами/аэропортами на заданную дату. " +
        "Вызывай только когда известны город/аэропорт отправления, город/аэропорт назначения и дата вылета.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Город или аэропорт отправления (например 'Berlin' или 'Berlin Brandenburg')" },
          destination: { type: "string", description: "Город или аэропорт назначения" },
          departureDate: { type: "string", description: "Дата вылета в формате YYYY-MM-DD" },
          returnDate: { type: "string", description: "Дата обратного вылета в формате YYYY-MM-DD (если нужен билет туда-обратно)" },
          adults: { type: "integer", description: "Число взрослых пассажиров, по умолчанию 1" },
        },
        required: ["origin", "destination", "departureDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_hotels",
      description:
        "Искать отели через Trivago MCP в заданном городе на заданные даты заезда и выезда. " +
        "Вызывай только когда известны город и даты заезда/выезда.",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "Город поиска отелей (в любом языке — перевод на английский выполняется автоматически)" },
          checkIn: { type: "string", description: "Дата заезда в формате YYYY-MM-DD" },
          checkOut: { type: "string", description: "Дата выезда в формате YYYY-MM-DD" },
          adults: { type: "integer", description: "Число взрослых гостей, по умолчанию 1" },
        },
        required: ["city", "checkIn", "checkOut"],
      },
    },
  },
];

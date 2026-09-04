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
          origin: {
            type: "string",
            description:
              "Город или аэропорт отправления — IATA-код или название на английском. ОБЯЗАТЕЛЬНО должен быть явно назван пользователем в текущем или недавнем сообщении об этой же поездке. НИКОГДА не подставляй сюда город по умолчанию и не бери его из другого, не связанного запроса.",
          },
          destination: {
            type: "string",
            description:
              "Город или аэропорт назначения — IATA-код или название на английском. ОБЯЗАТЕЛЬНО должен быть явно назван пользователем.",
          },
          departureDate: { type: "string", description: "Дата вылета в формате YYYY-MM-DD" },
          returnDate: { type: "string", description: "Дата обратного вылета в формате YYYY-MM-DD (если нужен билет туда-обратно)" },
          adults: { type: "integer", description: "Число взрослых пассажиров, по умолчанию 1" },
          maxResults: {
            type: "integer",
            description: "Сколько вариантов рейсов показать пользователю. По умолчанию 5 — увеличивай только если пользователь явно попросил больше.",
          },
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
          city: {
            type: "string",
            description:
              "Город поиска отелей (в любом языке — перевод на английский выполняется автоматически). ОБЯЗАТЕЛЬНО должен быть явно назван пользователем — никогда не подставляй город по умолчанию.",
          },
          checkIn: { type: "string", description: "Дата заезда в формате YYYY-MM-DD" },
          checkOut: { type: "string", description: "Дата выезда в формате YYYY-MM-DD" },
          adults: { type: "integer", description: "Число взрослых гостей, по умолчанию 1" },
          maxResults: {
            type: "integer",
            description: "Сколько отелей показать пользователю. По умолчанию 8 — увеличивай только если пользователь явно попросил больше.",
          },
        },
        required: ["city", "checkIn", "checkOut"],
      },
    },
  },
];

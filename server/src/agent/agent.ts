import type { ChatCompletionMessageParam, ChatCompletionToolMessageParam } from 'openai/resources/chat/completions';
import { getOpenRouterClient } from './openrouterClient.js';
import { config } from '../config.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { buildAgentTools, executeAgentTool } from './tools.js';

const MAX_TOOL_ITERATIONS = 6;

export interface AgentTurnResult {
  reply: string;
  messages: ChatCompletionMessageParam[];
}

/**
 * Runs one user turn through the LLM (via OpenRouter, OpenAI-compatible Chat
 * Completions API), following the tool-call loop until the model produces a
 * final text answer (or we hit the iteration cap). Each tool call is
 * dispatched to the corresponding MCP server via `executeAgentTool`.
 */
export async function runAgentTurn(
  history: ChatCompletionMessageParam[],
): Promise<AgentTurnResult> {
  const openRouter = getOpenRouterClient();
  const tools = await buildAgentTools();
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await openRouter.chat.completions.create({
      model: config.openRouterModel,
      max_tokens: 1500,
      tools,
      messages,
    });

    const choice = response.choices[0];
    const message = choice?.message;
    if (!message) {
      return { reply: 'Не удалось получить ответ от модели.', messages: history };
    }

    messages.push(message);

    const toolCalls = message.tool_calls?.filter((call) => call.type === 'function') ?? [];
    if (toolCalls.length === 0) {
      const reply = message.content?.trim();
      return { reply: reply || 'Не удалось получить ответ от модели.', messages: messages.slice(1) };
    }

    for (const call of toolCalls) {
      let input: Record<string, unknown> = {};
      try {
        input = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        input = {};
      }
      const result = await executeAgentTool(call.function.name, input);
      const toolMessage: ChatCompletionToolMessageParam = {
        role: 'tool',
        tool_call_id: call.id,
        content: result.text,
      };
      messages.push(toolMessage);
    }
  }

  return {
    reply: 'Поиск занял слишком много шагов подряд. Попробуйте уточнить запрос и повторить.',
    messages: messages.slice(1),
  };
}

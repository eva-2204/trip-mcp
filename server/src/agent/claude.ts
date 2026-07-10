import type Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from './anthropicClient.js';
import { config } from '../config.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { buildAgentTools, executeAgentTool } from './tools.js';

const MAX_TOOL_ITERATIONS = 6;

export interface AgentTurnResult {
  reply: string;
  messages: Anthropic.MessageParam[];
}

/**
 * Runs one user turn through Claude, following the tool-use loop until the
 * model produces a final text answer (or we hit the iteration cap). Each
 * tool call is dispatched to the corresponding MCP server via `executeAgentTool`.
 */
export async function runAgentTurn(
  history: Anthropic.MessageParam[],
): Promise<AgentTurnResult> {
  const anthropic = getAnthropicClient();
  const tools = await buildAgentTools();
  const messages: Anthropic.MessageParam[] = [...history];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: config.anthropicModel,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      const reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return { reply: reply || 'Не удалось получить ответ от модели.', messages };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeAgentTool(block.name, (block.input ?? {}) as Record<string, unknown>);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.text,
        is_error: result.isError,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    reply: 'Поиск занял слишком много шагов подряд. Попробуйте уточнить запрос и повторить.',
    messages,
  };
}

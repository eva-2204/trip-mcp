import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type Anthropic from '@anthropic-ai/sdk';
import { logBus, McpLogEvent } from './logBus.js';
import { runAgentTurn } from './agent/claude.js';
import { hasAnthropicKey } from './config.js';
import { MissingApiKeyError } from './agent/anthropicClient.js';

const WELCOME_TEXT =
  'Привет! Я ваш travel-агент ✈️ Помогу найти авиабилеты через Kiwi и отели через Trivago. ' +
  'Расскажите, куда и когда вы собираетесь — и я подберу варианты.';

const NO_KEY_TEXT =
  'Не задан ключ ANTHROPIC_API_KEY. Добавьте секретку с ключом Anthropic API — без него агент не сможет отвечать.';

type ServerMessage =
  | { type: 'welcome'; text: string }
  | { type: 'thinking'; value: boolean }
  | { type: 'assistant_message'; text: string }
  | { type: 'error'; text: string }
  | { type: 'mcp_log'; event: McpLogEvent }
  | { type: 'mcp_log_history'; events: McpLogEvent[] };

interface ClientMessage {
  type: 'user_message';
  text: string;
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function attachWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const history: Anthropic.MessageParam[] = [];

    send(ws, { type: 'welcome', text: WELCOME_TEXT });
    send(ws, { type: 'mcp_log_history', events: logBus.getHistory() });
    if (!hasAnthropicKey()) {
      send(ws, { type: 'error', text: NO_KEY_TEXT });
    }

    const unsubscribe = logBus.onLog((event) => {
      send(ws, { type: 'mcp_log', event });
    });

    ws.on('message', async (raw) => {
      let parsed: ClientMessage;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', text: 'Некорректное сообщение.' });
        return;
      }
      if (parsed.type !== 'user_message' || typeof parsed.text !== 'string' || !parsed.text.trim()) {
        return;
      }

      if (!hasAnthropicKey()) {
        send(ws, { type: 'error', text: NO_KEY_TEXT });
        return;
      }

      history.push({ role: 'user', content: parsed.text });
      send(ws, { type: 'thinking', value: true });
      try {
        const { reply, messages } = await runAgentTurn(history);
        history.length = 0;
        history.push(...messages);
        send(ws, { type: 'assistant_message', text: reply });
      } catch (err) {
        if (err instanceof MissingApiKeyError) {
          send(ws, { type: 'error', text: NO_KEY_TEXT });
        } else {
          send(ws, {
            type: 'error',
            text: `Ошибка при обращении к агенту: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } finally {
        send(ws, { type: 'thinking', value: false });
      }
    });

    ws.on('close', () => {
      unsubscribe();
    });
  });

  return wss;
}

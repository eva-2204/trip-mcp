import type OpenAI from "openai";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Simple in-memory per-session chat history. Fine for a single-process demo. */
class ConversationStore {
  private sessions = new Map<string, Message[]>();

  getHistory(sessionId: string): Message[] {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    return this.sessions.get(sessionId)!;
  }

  append(sessionId: string, message: Message): void {
    this.getHistory(sessionId).push(message);
  }

  reset(sessionId: string): void {
    this.sessions.set(sessionId, []);
  }
}

export const conversationStore = new ConversationStore();

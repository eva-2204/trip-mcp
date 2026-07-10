import OpenAI from 'openai';
import { config, hasOpenRouterKey } from '../config.js';

export class MissingApiKeyError extends Error {
  constructor() {
    super('OPENROUTER_API_KEY не задан');
    this.name = 'MissingApiKeyError';
  }
}

let client: OpenAI | null = null;

export function getOpenRouterClient(): OpenAI {
  if (!hasOpenRouterKey()) {
    throw new MissingApiKeyError();
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.openRouterApiKey, baseURL: config.openRouterBaseUrl });
  }
  return client;
}

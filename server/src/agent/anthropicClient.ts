import Anthropic from '@anthropic-ai/sdk';
import { config, hasAnthropicKey } from '../config.js';

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY не задан');
    this.name = 'MissingApiKeyError';
  }
}

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!hasAnthropicKey()) {
    throw new MissingApiKeyError();
  }
  if (!client) {
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

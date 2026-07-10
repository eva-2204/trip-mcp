import 'dotenv/config';

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export const config = {
  port: Number(envOrDefault('PORT', '8787')),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  anthropicModel: envOrDefault('ANTHROPIC_MODEL', 'claude-sonnet-5'),
  kiwiMcpUrl: envOrDefault('KIWI_MCP_URL', 'https://mcp.kiwi.com'),
  trivagoMcpUrl: envOrDefault('TRIVAGO_MCP_URL', 'https://mcp.trivago.com/mcp'),
};

export function hasAnthropicKey(): boolean {
  return config.anthropicApiKey.length > 0;
}

import 'dotenv/config';

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export const config = {
  port: Number(envOrDefault('PORT', '8787')),
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || '',
  openRouterBaseUrl: envOrDefault('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1'),
  openRouterModel: envOrDefault('OPENROUTER_MODEL', 'openrouter/free'),
  kiwiMcpUrl: envOrDefault('KIWI_MCP_URL', 'https://mcp.kiwi.com'),
  trivagoMcpUrl: envOrDefault('TRIVAGO_MCP_URL', 'https://mcp.trivago.com/mcp'),
};

export function hasOpenRouterKey(): boolean {
  return config.openRouterApiKey.length > 0;
}

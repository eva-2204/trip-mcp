export const config = {
  port: Number(process.env.PORT ?? 3000),
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: process.env.OPENROUTER_MODEL ?? "openrouter/free",
  },
  kiwi: {
    url: process.env.KIWI_MCP_URL ?? "https://mcp.kiwi.com",
  },
  trivago: {
    url: process.env.TRIVAGO_MCP_URL ?? "https://mcp.trivago.com/mcp",
  },
};

export function isOpenRouterConfigured(): boolean {
  return config.openrouter.apiKey.trim().length > 0;
}

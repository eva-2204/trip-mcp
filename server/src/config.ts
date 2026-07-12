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
  // Approximate, manually-maintained FX rates used only to show a rough RUB
  // equivalent next to prices returned by Kiwi/Trivago. There is no live FX
  // MCP or REST source in scope for this demo, so these are static and
  // overridable via env vars rather than fetched at request time.
  currency: {
    usdToRub: Number(process.env.USD_RUB_RATE ?? 80),
    eurToRub: Number(process.env.EUR_RUB_RATE ?? 93),
  },
};

export function isOpenRouterConfigured(): boolean {
  return config.openrouter.apiKey.trim().length > 0;
}

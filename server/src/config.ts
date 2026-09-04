export const config = {
  port: Number(process.env.PORT ?? 3000),
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    // Pinned to a specific free model rather than the "openrouter/free"
    // auto-router: that router was observed picking a different underlying
    // model on almost every call (tencent/hy3-20260706:free, openai/gpt-oss-20b:free,
    // openai/gpt-oss-120b:free, across different providers), with wildly
    // inconsistent Russian output quality and occasional script-mixing
    // garbage. gpt-oss-120b was the largest/most reliable of those observed.
    model: process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-120b:free",
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

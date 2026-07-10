import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logBus, McpServerId } from '../logBus.js';

export interface McpToolSummary {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Thin wrapper around the MCP TypeScript SDK's client for a single remote
 * MCP server (Kiwi or Trivago), reachable over Streamable HTTP. Handles
 * `initialize` + `Mcp-Session-Id` bookkeeping (done internally by the SDK
 * transport per the MCP spec) and emits request/response events onto the
 * shared logBus so the UI can show them.
 */
export class McpServerClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private connectPromise: Promise<void> | null = null;
  private toolsCache: McpToolSummary[] | null = null;

  constructor(
    private readonly serverId: McpServerId,
    private readonly serverLabel: string,
    private readonly url: string,
  ) {
    this.transport = new StreamableHTTPClientTransport(new URL(url));
    this.client = new Client(
      { name: 'trip-mcp-demo', version: '0.1.0' },
      { capabilities: {} },
    );
  }

  get sessionId(): string | undefined {
    return this.transport.sessionId;
  }

  async ensureConnected(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().catch((err) => {
      // Allow retrying the connection on the next call.
      this.connectPromise = null;
      throw err;
    });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    logBus.emitLog({
      server: this.serverId,
      serverLabel: this.serverLabel,
      kind: 'connect_start',
      title: `Инициализация MCP-сессии (${this.url})`,
      method: 'initialize',
      payload: { url: this.url, clientInfo: { name: 'trip-mcp-demo', version: '0.1.0' } },
    });
    try {
      await this.client.connect(this.transport);
      logBus.emitLog({
        server: this.serverId,
        serverLabel: this.serverLabel,
        kind: 'connect_success',
        title: 'MCP-сессия установлена',
        method: 'initialize',
        payload: {
          sessionId: this.transport.sessionId ?? null,
          serverInfo: this.client.getServerVersion() ?? null,
          capabilities: this.client.getServerCapabilities() ?? null,
        },
      });
    } catch (err) {
      logBus.emitLog({
        server: this.serverId,
        serverLabel: this.serverLabel,
        kind: 'connect_error',
        title: 'Не удалось установить MCP-сессию',
        method: 'initialize',
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  /** Fetches (and caches) the live tool list from the server via `tools/list`. */
  async listTools(): Promise<McpToolSummary[]> {
    if (this.toolsCache) return this.toolsCache;
    await this.ensureConnected();
    const result = await this.client.listTools();
    this.toolsCache = result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    return this.toolsCache;
  }

  async findToolSchema(toolName: string): Promise<McpToolSummary | null> {
    try {
      const tools = await this.listTools();
      return tools.find((t) => t.name === toolName) ?? null;
    } catch {
      return null;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    logBus.emitLog({
      server: this.serverId,
      serverLabel: this.serverLabel,
      kind: 'tool_request',
      title: `Вызов ${name}`,
      method: name,
      payload: args,
    });
    try {
      const result = await this.client.callTool({ name, arguments: args });
      logBus.emitLog({
        server: this.serverId,
        serverLabel: this.serverLabel,
        kind: result.isError ? 'tool_error' : 'tool_response',
        title: result.isError ? `Ошибка при вызове ${name}` : `Ответ на ${name}`,
        method: name,
        payload: result,
      });
      return result;
    } catch (err) {
      logBus.emitLog({
        server: this.serverId,
        serverLabel: this.serverLabel,
        kind: 'tool_error',
        title: `Ошибка при вызове ${name}`,
        method: name,
        payload: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}

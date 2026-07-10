import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, hasOpenRouterKey } from './config.js';
import { attachWebSocketServer } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasOpenRouterKey: hasOpenRouterKey() });
});

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api|\/ws).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(config.port, () => {
  console.log(`trip-mcp server listening on http://localhost:${config.port}`);
  if (!hasOpenRouterKey()) {
    console.warn('OPENROUTER_API_KEY не задан — агент будет отвечать ошибкой, пока ключ не будет добавлен.');
  }
});

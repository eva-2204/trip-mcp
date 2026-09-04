import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { config, isOpenRouterConfigured } from "./config.js";
import { statusRouter } from "./routes/status.js";
import { logsRouter } from "./routes/logs.js";
import { chatRouter } from "./routes/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", statusRouter);
app.use("/api", logsRouter);
app.use("/api", chatRouter);

// In production, serve the built web app (see web/ workspace) as static files.
const webDist = path.resolve(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(webDist, "index.html"), (err) => {
    if (err) res.status(404).send("Веб-интерфейс не собран. Запустите `npm run build:web`.");
  });
});

app.listen(config.port, () => {
  console.log(`trip-mcp server listening on :${config.port}`);
  console.log(`OpenRouter API key configured: ${isOpenRouterConfigured() ? "да" : "нет"}`);
});

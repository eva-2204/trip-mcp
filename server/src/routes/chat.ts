import { randomUUID } from "node:crypto";
import { Router } from "express";
import { isOpenRouterConfigured } from "../config.js";
import { handleUserMessage } from "../agent/agent.js";

export const chatRouter = Router();

chatRouter.post("/chat", async (req, res) => {
  if (!isOpenRouterConfigured()) {
    res.status(503).json({
      error: "OPENROUTER_API_KEY не задан. Укажите секрет OPENROUTER_API_KEY, чтобы запустить AI-агента.",
    });
    return;
  }

  const sessionId = String(req.body?.sessionId ?? "");
  const message = String(req.body?.message ?? "").trim();

  if (!sessionId || !message) {
    res.status(400).json({ error: "Требуются поля sessionId и message" });
    return;
  }

  const turnId = randomUUID();

  try {
    const reply = await handleUserMessage(sessionId, turnId, message);
    res.json({ reply, turnId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Внутренняя ошибка агента: ${detail}` });
  }
});

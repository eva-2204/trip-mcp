import { Router } from "express";
import { attachSseClient } from "../logging/logBus.js";

export const logsRouter = Router();

logsRouter.get("/logs/stream", (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  if (!sessionId) {
    res.status(400).json({ error: "sessionId обязателен" });
    return;
  }

  const detach = attachSseClient(sessionId, res);
  req.on("close", () => {
    detach();
  });
});

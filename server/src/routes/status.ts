import { Router } from "express";
import { isOpenRouterConfigured, config } from "../config.js";

export const statusRouter = Router();

statusRouter.get("/status", (_req, res) => {
  res.json({
    ready: isOpenRouterConfigured(),
    model: config.openrouter.model,
    kiwiUrl: config.kiwi.url,
    trivagoUrl: config.trivago.url,
  });
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { Controller } from "./controller";
import type { AutomationSettings, KeyboardProfile, ProfileId } from "../src/lib/types";

const PORT = Number(process.env.FUN60_PORT ?? 3815);
const HOST = "127.0.0.1";
const app = express();
const controller = new Controller();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.disable("x-powered-by");
app.use(cors({ origin: true, methods: ["GET", "POST", "PUT", "OPTIONS"] }));
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true, version: "0.2.0" }));
app.get("/api/status", (_request, response) => response.json(controller.status()));
app.post("/api/scan", async (_request, response) => response.json(await controller.scan()));
app.post("/api/apply/:id", async (request, response) => response.json(await controller.apply(request.params.id as ProfileId)));
app.post("/api/retrieve", async (_request, response) => {
  const snapshot = await controller.retrieve();
  response.json({ status: controller.status(), snapshot });
});
app.post("/api/factory-reset", async (request, response) => response.json(await controller.factoryReset(String(request.body?.confirmation ?? ""))));
app.put("/api/profiles/:id", (request, response) => response.json(controller.saveProfile(request.params.id as ProfileId, request.body as KeyboardProfile)));
app.put("/api/automation", (request, response) => response.json(controller.saveAutomation(request.body as AutomationSettings)));

app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_request, response) => response.sendFile(path.join(root, "dist", "index.html")));

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected bridge error.";
  response.status(400).json({ error: message });
});

await controller.start();
app.listen(PORT, HOST, () => {
  process.stdout.write(`FUN//CTRL bridge listening at http://${HOST}:${PORT}\n`);
});

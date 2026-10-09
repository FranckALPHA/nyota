// Serveur Nyota : document partagé + WebSocket (éditeurs) + MCP (IA externes) + agent IA intégré.

import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { ClientMessage, ServerMessage } from "@nyota/core";
import { Store } from "./store.js";
import { createMcpServer } from "./mcp.js";
import { type DesignRequest, runDesignAgent } from "./agent.js";

const PORT = Number(process.env.PORT ?? 4000);
const store = new Store(path.resolve(process.env.NYOTA_DATA ?? "data/document.json"));

const app = express();
app.use(express.json({ limit: "25mb" }));

app.get("/api/document", (_req, res) => res.json(store.doc));

// Agent intégré : capture d'écran et/ou texte → design. Le résultat arrive en direct par WebSocket.
app.post("/api/ai/design", async (req, res) => {
  const body = req.body as DesignRequest;
  try {
    const text = await runDesignAgent(store, body, (event) => store.broadcast({ type: "ai", event }));
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Présence : nombre d'éditeurs ouverts et dernière activité MCP, affichés dans l'éditeur.
let editors = 0;
let mcpLastSeen: number | null = null;
let presenceTimer: NodeJS.Timeout | undefined;
const broadcastPresence = () => {
  clearTimeout(presenceTimer);
  presenceTimer = setTimeout(() => store.broadcast({ type: "presence", editors, mcpLastSeen }), 200);
};

// MCP en HTTP « streamable », sans état : un serveur + un transport par requête.
app.post("/mcp", async (req, res) => {
  mcpLastSeen = Date.now();
  broadcastPresence();
  const server = createMcpServer(store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
const methodNotAllowed = (_req: express.Request, res: express.Response) =>
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

wss.on("connection", (ws: WebSocket) => {
  const send = (msg: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));
  send({ type: "doc", doc: store.doc });
  const unsubscribe = store.subscribe(send);
  editors++;
  broadcastPresence();

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    try {
      if (msg.type === "ops") store.commit(msg.ops, "human", msg.label, msg.origin);
      else if (msg.type === "undo") store.undo();
      else if (msg.type === "redo") store.redo();
      else if (msg.type === "selection") store.selection = msg.ids;
    } catch (err) {
      // L'opération a été refusée : on renvoie l'état de référence pour resynchroniser l'éditeur.
      send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      send({ type: "doc", doc: store.doc });
    }
  });
  ws.on("close", () => {
    unsubscribe();
    editors--;
    broadcastPresence();
  });
});

httpServer.listen(PORT, () => {
  console.log(`Nyota serveur  → http://localhost:${PORT}`);
  console.log(`MCP            → http://localhost:${PORT}/mcp`);
  if (!process.env.ANTHROPIC_API_KEY) console.log("ANTHROPIC_API_KEY absent : l'agent intégré est désactivé (MCP fonctionne).");
});

// Nyota comme serveur MCP : n'importe quelle IA compatible MCP peut lire et dessiner dans le document ouvert.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { designTools, runTool } from "@nyota/core";
import type { Store } from "./store.js";

export function createMcpServer(store: Store): McpServer {
  const server = new McpServer(
    { name: "nyota", version: "0.1.0" },
    {
      instructions:
        "Nyota est un outil de design d'interface statique. Le document est un arbre de frames, rectangles, " +
        "ellipses et textes. Appelle get_document avant de modifier un design. Les changements apparaissent " +
        "en direct dans l'éditeur de l'utilisateur.",
    },
  );

  for (const tool of designTools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (args: unknown) => {
        const res = runTool(store.toolContext("mcp"), tool.name, args);
        return res.ok
          ? { content: [{ type: "text" as const, text: JSON.stringify(res.result ?? { ok: true }) }] }
          : { content: [{ type: "text" as const, text: res.error }], isError: true };
      },
    );
  }

  return server;
}

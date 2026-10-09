// État de l'éditeur. Le document est une copie locale du document du serveur :
// on applique nos opérations tout de suite (réactivité) puis on les envoie ; celles des autres
// (IA intégrée, IA via MCP, autres onglets) arrivent par WebSocket.

import { useSyncExternalStore } from "react";
import {
  type AiEvent, type ClientMessage, type DesignDocument, type Op, type ServerMessage,
  applyOps, createDocument, newId,
} from "@nyota/core";

export interface AiImage {
  dataUrl: string;
  width: number; // dimensions de l'image (après réduction éventuelle)
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export type Tool = "select" | "frame" | "rect" | "ellipse" | "text" | "hand";

export interface EditorState {
  doc: DesignDocument;
  connected: boolean;
  selection: string[];
  tool: Tool;
  editingTextId: string | null;
  aiLog: AiEvent[];
  aiBusy: boolean;
  aiImage: AiImage | null;
  lastError: string | null;
  version: number; // incrémenté à chaque changement du document
}

const ORIGIN = newId();

let state: EditorState = {
  doc: createDocument(),
  connected: false,
  selection: [],
  tool: "select",
  editingTextId: null,
  aiLog: [],
  aiBusy: false,
  aiImage: null,
  lastError: null,
  version: 0,
};

const listeners = new Set<() => void>();
function set(patch: Partial<EditorState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useEditor<T>(select: (s: EditorState) => T): T {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => select(state),
  );
}
export const getState = () => state;

// ---- Connexion ----

let ws: WebSocket | null = null;
let queue: ClientMessage[] = [];

function send(msg: ClientMessage) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else queue.push(msg);
}

export function connect() {
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => {
    set({ connected: true });
    queue.forEach(send);
    queue = [];
  };
  ws.onclose = () => {
    set({ connected: false });
    setTimeout(connect, 1000);
  };
  ws.onmessage = (e) => receive(JSON.parse(e.data) as ServerMessage);
}

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case "doc":
      set({ doc: msg.doc, version: state.version + 1, selection: state.selection.filter((id) => msg.doc.nodes[id]) });
      break;
    case "ops": {
      if (msg.origin === ORIGIN) return; // déjà appliqué localement
      const doc = structuredClone(state.doc);
      try {
        applyOps(doc, msg.ops);
      } catch {
        return; // le serveur nous renverra le document complet
      }
      set({ doc, version: state.version + 1, selection: state.selection.filter((id) => doc.nodes[id]) });
      break;
    }
    case "error":
      set({ lastError: msg.message });
      setTimeout(() => set({ lastError: null }), 4000);
      break;
    case "ai":
      set({ aiLog: [...state.aiLog, msg.event].slice(-300) });
      break;
  }
}

// ---- Actions ----

export function dispatch(ops: Op[], label?: string) {
  if (!ops.length) return;
  const doc = structuredClone(state.doc);
  try {
    applyOps(doc, ops);
  } catch (err) {
    set({ lastError: err instanceof Error ? err.message : String(err) });
    return;
  }
  set({ doc, version: state.version + 1, selection: state.selection.filter((id) => doc.nodes[id]) });
  send({ type: "ops", ops, label, origin: ORIGIN });
}

export const undo = () => send({ type: "undo" });
export const redo = () => send({ type: "redo" });

export function select(ids: string[]) {
  set({ selection: ids, editingTextId: null });
  send({ type: "selection", ids });
}

export const setTool = (tool: Tool) => set({ tool });
export const setEditingText = (id: string | null) => set({ editingTextId: id });

export async function askAi(body: unknown) {
  set({ aiBusy: true });
  try {
    const res = await fetch("/api/ai/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) set({ lastError: json.error });
  } catch (err) {
    set({ lastError: String(err) });
  } finally {
    set({ aiBusy: false });
  }
}

export const setAiImage = (aiImage: AiImage | null) => set({ aiImage });

/** Charge une image (collée, déposée ou choisie) et la réduit à 1568 px max, la taille idéale pour la vision. */
export async function attachImage(file: Blob) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    setAiImage({ dataUrl: canvas.toDataURL("image/png"), width: w, height: h, originalWidth: img.naturalWidth, originalHeight: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

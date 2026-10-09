// Messages échangés entre l'éditeur et le serveur sur WebSocket.

import type { DesignDocument } from "./model.js";
import type { Author, Op } from "./ops.js";

export type ClientMessage =
  | { type: "ops"; ops: Op[]; label?: string; origin: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "selection"; ids: string[] };

export type ServerMessage =
  | { type: "doc"; doc: DesignDocument }
  | { type: "ops"; ops: Op[]; author: Author; label?: string; origin?: string }
  | { type: "error"; message: string }
  | { type: "ai"; event: AiEvent };

export type AiEvent =
  | { kind: "start"; jobId: string; prompt: string }
  | { kind: "thinking"; jobId: string; text: string }
  | { kind: "tool"; jobId: string; name: string; summary: string }
  | { kind: "done"; jobId: string; text: string }
  | { kind: "error"; jobId: string; message: string };

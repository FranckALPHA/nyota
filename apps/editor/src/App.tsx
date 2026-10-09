import { useEffect, useState } from "react";
import { type Op, makeNode, newId, subtree } from "@nyota/core";
import { Canvas, isTyping } from "./components/Canvas";
import { Layers } from "./components/Layers";
import { Properties } from "./components/Properties";
import { AiPanel } from "./components/AiPanel";
import { type Tool, attachImage, dispatch, getState, redo, select, setTool, undo, useEditor } from "./store";

const TOOLS: { id: Tool; key: string; icon: string; label: string }[] = [
  { id: "select", key: "v", icon: "↖", label: "Sélection (V)" },
  { id: "frame", key: "f", icon: "#", label: "Frame (F)" },
  { id: "rect", key: "r", icon: "▢", label: "Rectangle (R)" },
  { id: "ellipse", key: "o", icon: "◯", label: "Ellipse (O)" },
  { id: "text", key: "t", icon: "T", label: "Texte (T)" },
  { id: "hand", key: "h", icon: "✋", label: "Main (H / Espace)" },
];

export function App() {
  const tool = useEditor((s) => s.tool);
  const connected = useEditor((s) => s.connected);
  const docName = useEditor((s) => s.doc.name);
  const error = useEditor((s) => s.lastError);
  const [showMcp, setShowMcp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const { selection, doc } = getState();
      if (mod && e.key.toLowerCase() === "z") return e.preventDefault(), e.shiftKey ? redo() : undo();
      if (mod && e.key.toLowerCase() === "y") return e.preventDefault(), redo();
      if (mod && e.key.toLowerCase() === "d") return e.preventDefault(), duplicate(selection);
      if (mod && e.key.toLowerCase() === "a") return e.preventDefault(), select(doc.roots);
      if (e.key === "Delete" || e.key === "Backspace") {
        const top = selection.filter((id) => !selection.some((o) => o !== id && subtree(doc, o).includes(id)));
        return dispatch(top.map((id) => ({ kind: "delete", id })), "Supprimer");
      }
      if (e.key === "Escape") return select([]), setTool("select");
      if (e.key.startsWith("Arrow") && selection.length) {
        e.preventDefault();
        const d = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        return dispatch(selection.map((id) => ({ kind: "update", id, props: { x: doc.nodes[id]!.x + dx, y: doc.nodes[id]!.y + dy } })), "Décaler");
      }
      if (!mod) {
        const t = TOOLS.find((t) => t.key === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    // Coller une image n'importe où = l'envoyer à l'IA
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void attachImage(file);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => (window.removeEventListener("keydown", onKey), window.removeEventListener("paste", onPaste));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">✦ Nyota</div>
        <div className="tools">
          {TOOLS.map((t) => (
            <button key={t.id} title={t.label} className={tool === t.id ? "active" : ""} onClick={() => setTool(t.id)}>
              {t.icon}
            </button>
          ))}
        </div>
        <div className="doc-name">{docName}</div>
        <button className="ghost" onClick={() => setShowMcp(true)}>Connecter une IA (MCP)</button>
        <span className={"status " + (connected ? "on" : "off")} title={connected ? "Connecté au serveur" : "Hors ligne"} />
      </header>
      <aside className="left">
        <Layers />
      </aside>
      <main className="center">
        <Canvas />
        {error && <div className="toast">{error}</div>}
      </main>
      <aside className="right">
        <Properties />
        <AiPanel />
      </aside>
      {showMcp && <McpModal onClose={() => setShowMcp(false)} />}
    </div>
  );
}

/** Ctrl+D : copie la sélection (avec ses enfants) décalée de 16 px. */
function duplicate(ids: string[]) {
  const { doc } = getState();
  const ops: Op[] = [];
  const newIds: string[] = [];
  const copy = (id: string, parentId: string | null, offset: number) => {
    const src = doc.nodes[id]!;
    const { id: _i, type, parentId: _p, children, ...props } = src;
    const node = makeNode(type, { ...props, text: src.text ?? undefined, x: src.x + offset, y: src.y + offset }, newId());
    node.parentId = parentId;
    ops.push({ kind: "create", node });
    children.forEach((c) => copy(c, node.id, 0));
    return node.id;
  };
  for (const id of ids) if (doc.nodes[id]) newIds.push(copy(id, doc.nodes[id]!.parentId, 16));
  dispatch(ops, "Dupliquer");
  select(newIds);
}

function McpModal({ onClose }: { onClose: () => void }) {
  const url = `${location.origin}/mcp`;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>Connecter une IA à Nyota</b>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </div>
        <p>Nyota expose un serveur MCP. Toute IA compatible peut lire et dessiner dans ce document, en direct.</p>
        <p><b>Claude Code</b></p>
        <pre>claude mcp add --transport http nyota {url}</pre>
        <p><b>Autres clients MCP (Cursor, Claude Desktop…)</b></p>
        <pre>{JSON.stringify({ mcpServers: { nyota: { type: "http", url } } }, null, 2)}</pre>
        <p className="hint">Outils exposés : get_document, get_selection, create_nodes, update_nodes, delete_nodes, move_node, export_code.</p>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { DesignNode, NodeProps } from "@nyota/core";
import { dispatch, getState, select, useEditor } from "../store";

const ICON: Record<DesignNode["type"], string> = { frame: "#", rect: "▢", ellipse: "◯", text: "T" };

export function Layers() {
  const doc = useEditor((s) => s.doc);
  // Affichage du haut vers le bas = du plus haut dans l'empilement au plus bas, comme Figma
  return (
    <div className="panel layers">
      <div className="panel-title">Calques</div>
      {doc.roots.length === 0 && <p className="hint">Dessine une frame (F) ou colle une capture d'écran (Ctrl+V).</p>}
      {[...doc.roots].reverse().map((id) => (
        <LayerRow key={id} id={id} depth={0} />
      ))}
    </div>
  );
}

function LayerRow({ id, depth }: { id: string; depth: number }) {
  const node = useEditor((s) => s.doc.nodes[id]);
  const selected = useEditor((s) => s.selection.includes(id));
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  if (!node) return null;
  const toggle = (props: NodeProps) => dispatch([{ kind: "update", id, props }]);
  return (
    <>
      <div
        className={"layer" + (selected ? " selected" : "") + (node.visible ? "" : " hidden")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={(e) => select(e.shiftKey ? [...new Set([...useSel(), id])] : [id])}
        onDoubleClick={() => setRenaming(true)}
      >
        <span className="caret" onClick={(e) => (e.stopPropagation(), setOpen(!open))}>
          {node.children.length ? (open ? "▾" : "▸") : ""}
        </span>
        <span className="icon">{ICON[node.type]}</span>
        {renaming ? (
          <input
            autoFocus
            defaultValue={node.name}
            onBlur={(e) => (setRenaming(false), e.target.value && toggle({ name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        ) : (
          <span className="name">{node.name}</span>
        )}
        <span className="actions">
          <button title="Verrouiller" onClick={(e) => (e.stopPropagation(), toggle({ locked: !node.locked }))}>
            {node.locked ? "🔒" : "🔓"}
          </button>
          <button title="Afficher / masquer" onClick={(e) => (e.stopPropagation(), toggle({ visible: !node.visible }))}>
            {node.visible ? "👁" : "—"}
          </button>
        </span>
      </div>
      {open && [...node.children].reverse().map((c) => <LayerRow key={c} id={c} depth={depth + 1} />)}
    </>
  );
}

const useSel = () => getState().selection;

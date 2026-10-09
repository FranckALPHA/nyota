import { useState } from "react";
import { type DesignNode, type NodeProps, exportHtml, toTree } from "@nyota/core";
import { dispatch, useEditor } from "../store";

export function Properties() {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const [code, setCode] = useState<{ html: string; css: string } | null>(null);
  const node = selection.length === 1 ? doc.nodes[selection[0]!] : undefined;

  if (!node) {
    return (
      <div className="panel props">
        <div className="panel-title">Propriétés</div>
        <p className="hint">{selection.length > 1 ? `${selection.length} éléments sélectionnés` : "Aucune sélection"}</p>
      </div>
    );
  }

  const set = (props: NodeProps) => dispatch([{ kind: "update", id: node.id, props }]);

  return (
    <div className="panel props">
      <div className="panel-title">{label(node)}</div>

      <Section title="Position et taille">
        <div className="grid2">
          <Num label="X" value={node.x} onChange={(x) => set({ x })} />
          <Num label="Y" value={node.y} onChange={(y) => set({ y })} />
          <Num label="L" value={node.width} min={1} onChange={(width) => set({ width })} />
          <Num label="H" value={node.height} min={1} onChange={(height) => set({ height })} />
          <Num label="↻" value={node.rotation} onChange={(rotation) => set({ rotation })} />
          {node.type !== "ellipse" && node.type !== "text" && (
            <Num label="◜" value={node.radius} min={0} onChange={(radius) => set({ radius })} />
          )}
        </div>
      </Section>

      {node.type !== "text" && (
        <Section title="Remplissage">
          <ColorRow value={node.fill} onChange={(fill) => set({ fill })} allowNone />
        </Section>
      )}

      <Section title="Contour">
        {node.stroke ? (
          <div className="row">
            <ColorRow value={node.stroke.color} onChange={(color) => set({ stroke: { ...node.stroke!, color: color ?? "#000000" } })} />
            <Num label="ép." value={node.stroke.width} min={0} onChange={(width) => set({ stroke: { ...node.stroke!, width } })} />
            <button className="ghost" onClick={() => set({ stroke: null })}>−</button>
          </div>
        ) : (
          <button className="ghost" onClick={() => set({ stroke: { color: "#000000", width: 1 } })}>+ Ajouter un contour</button>
        )}
      </Section>

      <Section title="Calque">
        <div className="row">
          <label className="slider">
            Opacité
            <input type="range" min={0} max={1} step={0.01} value={node.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
            <span>{Math.round(node.opacity * 100)} %</span>
          </label>
        </div>
        {node.type === "frame" && (
          <label className="check">
            <input type="checkbox" checked={node.clip} onChange={(e) => set({ clip: e.target.checked })} /> Rogner le contenu
          </label>
        )}
      </Section>

      {node.text && (
        <Section title="Texte">
          <textarea
            className="text-content"
            value={node.text.content}
            onChange={(e) => set({ text: { content: e.target.value } })}
          />
          <div className="grid2">
            <Num label="Taille" value={node.text.fontSize} min={1} onChange={(fontSize) => set({ text: { fontSize } })} />
            <select value={node.text.fontWeight} onChange={(e) => set({ text: { fontWeight: Number(e.target.value) } })}>
              {[300, 400, 500, 600, 700, 800].map((w) => (
                <option key={w} value={w}>{WEIGHTS[w]}</option>
              ))}
            </select>
            <Num label="Interl." value={node.text.lineHeight} step={0.05} min={0.5} onChange={(lineHeight) => set({ text: { lineHeight } })} />
            <select value={node.text.align} onChange={(e) => set({ text: { align: e.target.value as "left" } })}>
              <option value="left">Gauche</option>
              <option value="center">Centre</option>
              <option value="right">Droite</option>
            </select>
          </div>
          <input className="font" value={node.text.fontFamily} onChange={(e) => set({ text: { fontFamily: e.target.value } })} />
          <ColorRow value={node.text.color} onChange={(color) => set({ text: { color: color ?? "#000000" } })} />
        </Section>
      )}

      <Section title="Code">
        <button className="ghost" onClick={() => setCode(exportHtml(toTree(doc, node.id)))}>Exporter en HTML / CSS</button>
      </Section>

      {code && <CodeModal code={code} onClose={() => setCode(null)} />}
    </div>
  );
}

const WEIGHTS: Record<number, string> = { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extrabold" };
const label = (n: DesignNode) => ({ frame: "Frame", rect: "Rectangle", ellipse: "Ellipse", text: "Texte" })[n.type] + " · " + n.name;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <div className="section-title">{title}</div>
      {children}
    </div>
  );
}

/** Champ numérique : on valide à Entrée ou en quittant le champ. */
function Num({ label, value, onChange, min, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Math.round(value * 100) / 100);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    setDraft(null);
    if (Number.isFinite(v) && v !== value) onChange(min !== undefined ? Math.max(min, v) : v);
  };
  return (
    <label className="num">
      <span>{label}</span>
      <input
        value={shown}
        inputMode="decimal"
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const d = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(Math.round((value + d) * 100) / 100);
          }
        }}
      />
    </label>
  );
}

function ColorRow({ value, onChange, allowNone }: { value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const hex = value ? value.slice(0, 7) : "#FFFFFF";
  return (
    <div className="color-row">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value.toUpperCase() + (value?.slice(7) ?? ""))} />
      <input
        className="hex"
        value={draft ?? (value ?? "aucun")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === null) return;
          const v = draft.trim().toUpperCase();
          setDraft(null);
          if (/^#([0-9A-F]{6}|[0-9A-F]{8})$/.test(v)) onChange(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {allowNone && value && <button className="ghost" title="Retirer" onClick={() => onChange(null)}>−</button>}
      {allowNone && !value && <button className="ghost" title="Ajouter" onClick={() => onChange("#D9D9D9")}>+</button>}
    </div>
  );
}

function CodeModal({ code, onClose }: { code: { html: string; css: string }; onClose: () => void }) {
  const full = `<style>\n${code.css}\n</style>\n\n${code.html}`;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>HTML / CSS</b>
          <button className="ghost" onClick={() => navigator.clipboard.writeText(full)}>Copier</button>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </div>
        <pre>{full}</pre>
      </div>
    </div>
  );
}

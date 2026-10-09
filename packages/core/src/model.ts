// Modèle de document Nyota : un dictionnaire plat de nœuds + l'ordre des enfants.
// Plat = facile à modifier par opérations, facile à synchroniser, facile à lire pour une IA.

export type NodeType = "frame" | "rect" | "ellipse" | "text";

export interface Stroke {
  color: string;
  width: number;
}

export interface TextStyle {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
}

export interface DesignNode {
  id: string;
  type: NodeType;
  name: string;
  parentId: string | null; // null = posé directement sur le canevas
  children: string[];
  // Position relative au parent
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string | null; // "#RRGGBB" ou "#RRGGBBAA"
  stroke: Stroke | null;
  radius: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  clip: boolean; // les frames rognent leur contenu
  text: TextStyle | null;
}

export interface DesignDocument {
  id: string;
  name: string;
  nodes: Record<string, DesignNode>;
  roots: string[]; // ordre d'empilement sur le canevas (dernier = au-dessus)
}

export type NodeProps = Partial<Omit<DesignNode, "id" | "type" | "parentId" | "children" | "text">> & {
  text?: Partial<TextStyle>;
};

export function createDocument(name = "Sans titre"): DesignDocument {
  return { id: newId(), name, nodes: {}, roots: [] };
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return Date.now().toString(36) + "-" + counter.toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

export const DEFAULT_TEXT: TextStyle = {
  content: "Texte",
  fontFamily: "Inter",
  fontSize: 16,
  fontWeight: 400,
  color: "#111111",
  align: "left",
  lineHeight: 1.3,
};

export function makeNode(type: NodeType, props: NodeProps = {}, id = newId()): DesignNode {
  const { text, ...rest } = props;
  return {
    id,
    type,
    name: defaultName(type),
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: type === "text" ? 120 : 100,
    height: type === "text" ? 24 : 100,
    rotation: 0,
    fill: type === "frame" ? "#FFFFFF" : type === "text" ? null : "#D9D9D9",
    stroke: null,
    radius: 0,
    opacity: 1,
    visible: true,
    locked: false,
    clip: type === "frame",
    text: type === "text" ? { ...DEFAULT_TEXT, ...text } : null,
    ...rest,
  };
}

function defaultName(type: NodeType): string {
  return { frame: "Frame", rect: "Rectangle", ellipse: "Ellipse", text: "Texte" }[type];
}

export function siblingsOf(doc: DesignDocument, parentId: string | null): string[] {
  return parentId ? doc.nodes[parentId]!.children : doc.roots;
}

/** Position absolue (sur le canevas) d'un nœud, en remontant ses parents. */
export function absolutePosition(doc: DesignDocument, id: string): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let cur: DesignNode | undefined = doc.nodes[id];
  while (cur) {
    x += cur.x;
    y += cur.y;
    cur = cur.parentId ? doc.nodes[cur.parentId] : undefined;
  }
  return { x, y };
}

/** Le nœud et tous ses descendants, parents d'abord. */
export function subtree(doc: DesignDocument, id: string): string[] {
  const out: string[] = [];
  const walk = (nid: string) => {
    out.push(nid);
    doc.nodes[nid]?.children.forEach(walk);
  };
  walk(id);
  return out;
}

/** Arbre lisible (pour les IA et l'export). */
export interface NodeTree extends Omit<DesignNode, "children" | "parentId"> {
  children: NodeTree[];
}

export function toTree(doc: DesignDocument, id: string): NodeTree {
  const { children, parentId: _p, ...n } = doc.nodes[id]!;
  return { ...n, children: children.map((c) => toTree(doc, c)) };
}

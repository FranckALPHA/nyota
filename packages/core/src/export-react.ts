// Design → projet React : un composant par nœud.
//
// Règle de modularité :
//  - le composant ENFANT décrit son apparence (taille, couleur, radius, texte…) dans son propre CSS ;
//  - le composant PARENT décide où l'enfant est posé (left/top/rotation) via une classe qu'il lui passe.
// Chaque composant reste donc réutilisable ailleurs, et la page entière reste fidèle au design.

import { type DesignDocument, type DesignNode } from "./model.js";

export type FileMap = Record<string, string>;

export interface ReactExportOptions {
  /** Inclure le squelette Vite (package.json, index.html, main.jsx…) pour obtenir un projet lançable. */
  project?: boolean;
}

interface Comp {
  node: DesignNode;
  name: string; // PascalCase unique
  parent: Comp | null;
  children: Comp[];
}

export function exportReact(doc: DesignDocument, rootId: string, opts: ReactExportOptions = {}): FileMap {
  const root = doc.nodes[rootId];
  if (!root) throw new Error(`Nœud introuvable : ${rootId}`);

  // 1. Arbre des composants avec des noms uniques
  const used = new Set(["App", "React", "Fragment"]);
  const build = (node: DesignNode, parent: Comp | null): Comp => {
    const comp: Comp = { node, name: uniqueName(node, used), parent, children: [] };
    comp.children = node.children
      .map((id) => doc.nodes[id]!)
      .filter((c) => c.visible)
      .map((c) => build(c, comp));
    return comp;
  };
  const tree = build(root, null);

  // 2. Un fichier .jsx + un .module.css par composant
  const files: FileMap = {};
  const walk = (c: Comp) => {
    const dir = `src/components/${c.name}`;
    files[`${dir}/${c.name}.jsx`] = componentJsx(c);
    files[`${dir}/${c.name}.module.css`] = componentCss(c);
    c.children.forEach(walk);
  };
  walk(tree);

  files["STRUCTURE.md"] = structureMd(tree);
  if (opts.project !== false) Object.assign(files, projectFiles(tree, collectFonts(tree)));
  return files;
}

// ---------- Composants ----------

function componentJsx(c: Comp): string {
  const { node } = c;
  const kind = { frame: "Frame", rect: "Rectangle", ellipse: "Ellipse", text: "Texte" }[node.type];
  const header = [
    `// ${c.name} — ${kind} « ${node.name} » (généré par Nyota, id ${node.id})`,
    `// Parent : ${c.parent ? c.parent.name : "aucun (composant racine)"}`,
    ...(c.children.length ? [`// Enfants : ${c.children.map((k) => k.name).join(", ")}`] : []),
  ];
  const imports = [
    `import styles from "./${c.name}.module.css";`,
    ...c.children.map((k) => `import ${k.name} from "../${k.name}/${k.name}.jsx";`),
  ];
  const cx = "[styles.root, className].filter(Boolean).join(\" \")";

  let body: string;
  if (node.type === "text") {
    const def = JSON.stringify(node.text?.content ?? "");
    body =
      `export default function ${c.name}({ className, style, text = ${def} }) {\n` +
      `  return (\n` +
      `    <p className={${cx}} style={style} data-nyota="${c.name}">\n` +
      `      {text}\n` +
      `    </p>\n` +
      `  );\n` +
      `}\n`;
  } else {
    const kids = c.children.map((k) => `      <${k.name} className={styles.${slotClass(k)}} />`);
    body =
      `export default function ${c.name}({ className, style, children }) {\n` +
      `  return (\n` +
      `    <div className={${cx}} style={style} data-nyota="${c.name}">\n` +
      [...kids, "      {children}"].join("\n") +
      `\n    </div>\n` +
      `  );\n` +
      `}\n`;
  }
  return `${header.join("\n")}\n\n${imports.join("\n")}\n\n${body}`;
}

function componentCss(c: Comp): string {
  const n = c.node;
  const root: string[] = [
    "box-sizing: border-box",
    `width: ${px(n.width)}`,
  ];
  if (n.type === "text" && n.text) {
    // Le texte peut déborder de sa boîte en hauteur, comme dans l'éditeur.
    root.push(
      `min-height: ${px(n.height)}`,
      "margin: 0",
      `font-family: ${fontStack(n.text.fontFamily)}`,
      `font-size: ${px(n.text.fontSize)}`,
      `font-weight: ${n.text.fontWeight}`,
      `line-height: ${n.text.lineHeight}`,
      `color: ${n.text.color}`,
      `text-align: ${n.text.align}`,
      "white-space: pre-wrap",
      "overflow-wrap: break-word",
    );
  } else {
    root.push(`height: ${px(n.height)}`);
    if (n.fill) root.push(`background: ${n.fill}`);
    if (n.type === "ellipse") root.push("border-radius: 50%");
    else if (n.radius) root.push(`border-radius: ${px(n.radius)}`);
    if (n.type === "frame" && n.clip) root.push("overflow: hidden");
  }
  if (n.stroke && n.stroke.width > 0) {
    // Contour centré sur le bord, comme dans l'éditeur (moitié dedans, moitié dehors)
    root.push(`outline: ${px(n.stroke.width)} solid ${n.stroke.color}`, `outline-offset: ${px(-n.stroke.width / 2)}`);
  }
  if (n.opacity !== 1) root.push(`opacity: ${n.opacity}`);

  const blocks = [
    `/* Apparence de ${c.name} */\n.root {\n  ${root.join(";\n  ")};\n}`,
    // Spécificité nulle : le placement décidé par le parent (position: absolute) l'emporte toujours,
    // quel que soit l'ordre de chargement des fichiers CSS.
    `/* Par défaut (composant utilisé seul) */\n:where(.root) {\n  position: relative;\n}`,
  ];

  // Placement des enfants : c'est le parent qui décide où ils vont.
  for (const k of c.children) {
    const p = [`position: absolute`, `left: ${px(k.node.x)}`, `top: ${px(k.node.y)}`];
    if (k.node.rotation) p.push(`transform: rotate(${k.node.rotation}deg)`, "transform-origin: top left");
    blocks.push(`/* Placement de ${k.name} dans ${c.name} */\n.${slotClass(k)} {\n  ${p.join(";\n  ")};\n}`);
  }
  return blocks.join("\n\n") + "\n";
}

// ---------- Projet ----------

function projectFiles(tree: Comp, fonts: Set<string>): FileMap {
  const slug = kebab(tree.node.name) || "nyota-export";
  const fontLink = fonts.size
    ? `    <link rel="preconnect" href="https://fonts.googleapis.com" />\n` +
      `    <link href="https://fonts.googleapis.com/css2?${[...fonts]
        .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@100..900`)
        .join("&")}&display=swap" rel="stylesheet" />\n`
    : "";
  return {
    "package.json": JSON.stringify(
      {
        name: slug,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
        dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" },
        devDependencies: { "@vitejs/plugin-react": "^5.0.4", vite: "^7.1.12" },
      },
      null,
      2,
    ) + "\n",
    "vite.config.js": `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n`,
    "index.html":
      `<!doctype html>\n<html lang="fr">\n  <head>\n    <meta charset="UTF-8" />\n` +
      `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
      `    <title>${escapeHtml(tree.node.name)}</title>\n${fontLink}  </head>\n  <body>\n` +
      `    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n`,
    "src/main.jsx":
      `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./index.css";\n\n` +
      `createRoot(document.getElementById("root")).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`,
    "src/App.jsx":
      `import ${tree.name} from "./components/${tree.name}/${tree.name}.jsx";\n\n` +
      `export default function App() {\n  return (\n    <main className="stage">\n      <${tree.name} />\n    </main>\n  );\n}\n`,
    "src/index.css":
      `*, *::before, *::after { box-sizing: border-box; }\nbody { margin: 0; background: #e5e5e5; }\n` +
      `.stage { min-height: 100vh; display: grid; place-items: center; padding: 40px; }\n`,
    "README.md":
      `# ${tree.node.name}\n\nExport React généré par **Nyota** : un composant par élément du design.\n\n` +
      "```bash\nnpm install\nnpm run dev\n```\n\n" +
      `- Chaque composant est dans \`src/components/<Nom>/\` (\`.jsx\` + \`.module.css\`).\n` +
      `- Le CSS d'un composant décrit **son apparence** ; le CSS de son parent décrit **où il est placé**.\n` +
      `- Tous les composants acceptent \`className\` et \`style\` ; les textes acceptent \`text\` ; les conteneurs acceptent \`children\`.\n` +
      `- L'arbre complet est dans [STRUCTURE.md](STRUCTURE.md).\n`,
  };
}

function structureMd(tree: Comp): string {
  const lines: string[] = [];
  const walk = (c: Comp, depth: number) => {
    lines.push(`${"  ".repeat(depth)}- **${c.name}** — ${c.node.type} « ${c.node.name} » (${r(c.node.width)}×${r(c.node.height)})`);
    c.children.forEach((k) => walk(k, depth + 1));
  };
  walk(tree, 0);
  return `# Structure des composants\n\nQui contient qui (le parent pose ses enfants) :\n\n${lines.join("\n")}\n`;
}

// ---------- Utilitaires ----------

function uniqueName(node: DesignNode, used: Set<string>): string {
  let base = pascal(node.name);
  if (!base || !/^[A-Z]/.test(base)) base = pascal(node.type) + base;
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  used.add(name);
  return name;
}

const words = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean);
const pascal = (s: string) => words(s).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
const kebab = (s: string) => words(s).join("-").toLowerCase();
const slotClass = (c: Comp) => "slot" + c.name;
const px = (v: number) => `${r(v)}px`;
const r = (v: number) => Math.round(v * 100) / 100;
const fontStack = (f: string) => `"${f.replace(/"/g, "")}", system-ui, sans-serif`;
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function collectFonts(c: Comp, out = new Set<string>()): Set<string> {
  if (c.node.text) out.add(c.node.text.fontFamily);
  c.children.forEach((k) => collectFonts(k, out));
  return out;
}

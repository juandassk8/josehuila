import { useEffect, useRef } from "react";
import { DS } from "../../lib/design.js";

// Editor de guion enriquecido (README §Editor). contenteditable con toolbar
// B / U / lista / imagen y atajos: "-" "*" "•" + espacio → lista; "1." + espacio →
// numerada; Tab / Shift+Tab indentan. Guarda en onBlur (no en cada tecla) para no
// perder el caret. styleWithCSS=false siempre, para no inyectar spans con color.
//
// TODO(F3): opción de migrar a TipTap (ya instalado) si se quiere colaboración/
// tablas; hoy replica exactamente el comportamiento del prototipo.

const ICONS = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z",
  underline: "M7 4v7a5 5 0 0 0 10 0V4M5 20h14",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
};

const escapeHtml = (s) => String(s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Sanea el HTML del guion: quita elementos peligrosos/rompe-layout (script/style/
// iframe/svg…) y TODOS los atributos (style/class/position/on*), dejando solo el
// texto y las etiquetas semánticas (p, br, b, u, ul/ol/li, h1-3). Idempotente.
// Evita que un pegado con HTML arbitrario tape la pantalla o corrompa el slot.
export function sanitizeScript(html) {
  if (!html) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,link,meta,iframe,object,embed,svg,head,form,input,button,video,audio,img").forEach((el) => el.remove());
    const ALLOWED = new Set(["href"]);
    doc.querySelectorAll("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        const name = attr.name.toLowerCase();
        // href solo con esquemas inofensivos: un "javascript:" pegado en un guion sería XSS al hacer clic.
        if (!ALLOWED.has(name) || (name === "href" && !/^(https?:|mailto:|tel:|#|\/)/i.test(attr.value.trim()))) el.removeAttribute(attr.name);
      }
    });
    return doc.body.innerHTML;
  } catch { return escapeHtml(html); }
}

// Convierte texto plano pegado en párrafos limpios (respeta saltos de línea).
function textToParagraphs(text) {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "<p><br></p>";
  return t.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

function blockOf(node, root) {
  let n = node.nodeType === 3 ? node.parentNode : node;
  while (n && n !== root && !/^(P|DIV|LI|H1|H2|H3|BLOCKQUOTE)$/.test(n.nodeName)) n = n.parentNode;
  return n && n !== root ? n : null;
}

function startList(root, block, tag) {
  const caret = (li) => {
    const sel = window.getSelection(), r = document.createRange();
    r.setStart(li, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
  };
  const li = document.createElement("li");
  li.appendChild(document.createElement("br"));
  const prev = block ? block.previousElementSibling : null;
  if (prev && prev.nodeName === tag.toUpperCase()) {
    prev.appendChild(li);
    if (block?.parentNode) block.parentNode.removeChild(block);
    caret(li); return;
  }
  const list = document.createElement(tag);
  list.appendChild(li);
  if (block?.parentNode) block.parentNode.replaceChild(list, block);
  else root.appendChild(list);
  caret(li);
}

export function ScriptEditor({ value, onChange, editable = true }) {
  const ref = useRef(null);
  const latestRef = useRef(null);        // último HTML tipeado (para flush al desmontar)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Si el editor se desmonta sin disparar blur (cambio programático de etapa/vista),
  // igual persistimos lo último tipeado — evita perder la edición en curso.
  useEffect(() => () => {
    if (editable && latestRef.current != null) onChangeRef.current?.(sanitizeScript(latestRef.current));
  }, [editable]);

  const cmd = (c) => (e) => {
    e.preventDefault();
    document.execCommand("styleWithCSS", false, false);
    document.execCommand(c, false, null);
  };

  // Pegar SIEMPRE como texto plano → párrafos limpios (evita HTML arbitrario que
  // rompe el editor). Es justo lo que se quiere al pegar un guion como base.
  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertHTML", false, textToParagraphs(text));
  };

  const onKeyDown = (e) => {
    const root = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      document.execCommand("styleWithCSS", false, false);
      document.execCommand(e.shiftKey ? "outdent" : "indent");
      return;
    }
    if (e.key !== " ") return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const r = sel.getRangeAt(0), node = r.startContainer;
    if (node.nodeType !== 3) return;
    const before = node.textContent.slice(0, r.startOffset);
    const block = blockOf(node, root);
    if (block && block.nodeName === "LI") return;
    const bullet = /^\s*[-*•]$/.test(before);
    const ordered = /^\s*1[.)]$/.test(before);
    if (!bullet && !ordered) return;
    if (block && block.textContent.replace(/\s|[-*•1.)]/g, "").length) return;
    e.preventDefault();
    startList(root, block, bullet ? "ul" : "ol");
  };

  const btn = (c, path) => (
    <button
      type="button" key={c} onMouseDown={cmd(c)} title={c}
      style={{ width: 28, height: 28, display: "grid", placeItems: "center", borderRadius: 8, cursor: "pointer", color: DS.textSecondary, background: "transparent", border: "1px solid var(--line)" }}
    >
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </button>
  );

  return (
    <div style={{ borderRadius: 14, border: "1px solid var(--line)", background: "var(--surface-2)", overflow: "hidden" }}>
      {editable && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 8px", borderBottom: "1px solid var(--line)" }}>
          {btn("bold", ICONS.bold)}
          {btn("underline", ICONS.underline)}
          {btn("insertUnorderedList", ICONS.list)}
          <span style={{ marginLeft: "auto", fontSize: 11, color: DS.textHint }}>Hooks · Body · CTA</span>
        </div>
      )}
      <div
        ref={ref}
        className="doc"
        contentEditable={editable}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: sanitizeScript(value) || "<p><br></p>" }}
        onKeyDown={editable ? onKeyDown : undefined}
        onPaste={editable ? onPaste : undefined}
        onInput={editable ? (e) => { latestRef.current = e.currentTarget.innerHTML; } : undefined}
        onBlur={editable ? (e) => { latestRef.current = null; onChange?.(sanitizeScript(e.currentTarget.innerHTML)); } : undefined}
        style={{ padding: "14px 16px", fontSize: 13, lineHeight: 1.65, color: DS.textSecondary, minHeight: 150, outline: "none" }}
      />
    </div>
  );
}

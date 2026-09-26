import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef, useState, useCallback } from "react";
import { DS } from "../../lib/design.js";

const STORY_TEMPLATE_HTML = `
<h3>Objetivo de la secuencia:</h3>
<p></p>
<table>
  <tr><th>No</th><th>Objetivo</th><th>Imagen o Video</th><th>Texto Superpuesto</th><th>Overlay</th></tr>
  <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>2</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>4</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>5</td><td></td><td></td><td></td><td></td></tr>
  <tr><td>6</td><td></td><td></td><td></td><td></td></tr>
</table>
`;

export const TEMPLATES = [
  { key: "historia", label: "📱 Plantilla Historia", html: STORY_TEMPLATE_HTML },
  { key: "empty", label: "📄 Vacío", html: "" },
];

// Convert a File to base64 data URL
function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

export function RichEditor({ content, onChange, placeholder, editable = true }) {
  const initialSet = useRef(false);
  const programmaticUpdate = useRef(false);

  // Handle image drop and paste
  const handleDrop = useCallback((view, event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return false;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return false;
    event.preventDefault();
    imageFiles.forEach(async (file) => {
      const src = await fileToBase64(file);
      view.dispatch(
        view.state.tr.replaceSelectionWith(
          view.state.schema.nodes.image.create({ src })
        )
      );
    });
    return true;
  }, []);

  const handlePaste = useCallback((view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;
    const imageItems = Array.from(items).filter((item) => item.type.startsWith("image/"));
    if (!imageItems.length) return false;
    event.preventDefault();
    imageItems.forEach(async (item) => {
      const file = item.getAsFile();
      if (!file) return;
      const src = await fileToBase64(file);
      view.dispatch(
        view.state.tr.replaceSelectionWith(
          view.state.schema.nodes.image.create({ src })
        )
      );
    });
    return true;
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({
        placeholder: placeholder || "Escribe aquí… arrastra imágenes directamente",
      }),
    ],
    content: content || "",
    editable,
    onUpdate: ({ editor: ed }) => {
      if (programmaticUpdate.current) return; // sync desde prop, no notificar al padre
      onChange?.(ed.getHTML());
    },
    editorProps: {
      handleDrop,
      handlePaste,
      attributes: {
        style: `color:${DS.textPrimary};font-family:${DS.font};font-size:14px;line-height:1.7;min-height:200px;outline:none;padding:0;`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    if (content == null) return;
    if (editor.isFocused) return;
    if (editor.getHTML() === content) return;
    programmaticUpdate.current = true;
    try {
      editor.commands.setContent(content, { emitUpdate: false });
    } finally {
      // queueMicrotask asegura que el reset corre después de cualquier evento sincrónico
      queueMicrotask(() => { programmaticUpdate.current = false; });
    }
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div>
      {editable && <Toolbar editor={editor} />}
      <div
        style={{
          border: DS.border,
          borderRadius: 12,
          padding: "16px 18px",
          background: DS.bgCard,
          minHeight: 240,
          position: "relative",
        }}
      >
        <EditorContent editor={editor} />

        {/* Table floating menu — shows when cursor is inside a table */}
        {editable && editor.isActive("table") && (
          <TableControls editor={editor} />
        )}
      </div>
      <style>{buildEditorStyles()}</style>
    </div>
  );
}

// ── Table controls (shown when cursor is inside a table) ──
function TableControls({ editor }) {
  return (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap",
      padding: "6px 8px", marginTop: 8,
      borderRadius: 8, background: DS.bgCard,
      border: DS.border,
    }}>
      <TblBtn onClick={() => editor.chain().focus().addRowAfter().run()}>
        ＋ Fila abajo
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().addRowBefore().run()}>
        ↑ Fila arriba
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().addColumnAfter().run()}>
        ＋ Columna →
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().addColumnBefore().run()}>
        ← Columna
      </TblBtn>
      <Sep />
      <TblBtn onClick={() => editor.chain().focus().deleteRow().run()} danger>
        🗑 Fila
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().deleteColumn().run()} danger>
        🗑 Columna
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().deleteTable().run()} danger>
        🗑 Tabla
      </TblBtn>
      <Sep />
      <TblBtn onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
        Header
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().mergeCells().run()}>
        Merge
      </TblBtn>
      <TblBtn onClick={() => editor.chain().focus().splitCell().run()}>
        Split
      </TblBtn>
    </div>
  );
}

function TblBtn({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px", borderRadius: 6, border: "none",
        background: "transparent", cursor: "pointer",
        color: danger ? DS.red : DS.textSecondary,
        fontSize: 11, fontWeight: 600, fontFamily: DS.font,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, background: DS.textHint, margin: "0 2px", alignSelf: "stretch" }} />;
}

// ── Main toolbar ──
function Toolbar({ editor }) {
  const btn = (active) => ({
    padding: "5px 9px", borderRadius: 6, border: "none",
    background: active ? DS.bgCard : "transparent",
    color: active ? DS.textPrimary : DS.textSecondary,
    cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "background 0.1s",
  });

  const addImageFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const src = await fileToBase64(file);
      editor.chain().focus().setImage({ src }).run();
    };
    input.click();
  };

  const addImageFromUrl = () => {
    const url = prompt("URL de la imagen:");
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 6, cols: 5, withHeaderRow: true }).run();
  };

  const insertTemplate = (html) => {
    editor.chain().focus().insertContent(html).run();
  };

  return (
    <div style={{
      display: "flex", gap: 2, flexWrap: "wrap",
      padding: "6px 4px", marginBottom: 8,
      borderRadius: 10, background: DS.bgCard,
      border: DS.border,
    }}>
      <button onClick={() => editor.chain().focus().toggleBold().run()} style={btn(editor.isActive("bold"))} title="Bold (Cmd+B)">
        <strong>B</strong>
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} style={btn(editor.isActive("italic"))} title="Italic (Cmd+I)">
        <em>I</em>
      </button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} style={btn(editor.isActive("strike"))} title="Tachado">
        <s>S</s>
      </button>
      <Separator />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} style={btn(editor.isActive("heading", { level: 1 }))}>H1</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={btn(editor.isActive("heading", { level: 2 }))}>H2</button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} style={btn(editor.isActive("heading", { level: 3 }))}>H3</button>
      <Separator />
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} style={btn(editor.isActive("bulletList"))}>☰</button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} style={btn(editor.isActive("orderedList"))}>1.</button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} style={btn(editor.isActive("blockquote"))}>"</button>
      <Separator />
      <button onClick={addTable} style={btn(false)} title="Insertar tabla 5×6">⊞ Tabla</button>
      <ImageDropdown onFromFile={addImageFromFile} onFromUrl={addImageFromUrl} />
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} style={btn(false)}>―</button>
      <Separator />
      <TemplateDropdown onInsert={insertTemplate} />
    </div>
  );
}

function ImageDropdown({ onFromFile, onFromUrl }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "5px 9px", borderRadius: 6, border: "none",
          background: open ? DS.bgCard : "transparent",
          color: open ? DS.textPrimary : DS.textSecondary,
          cursor: "pointer", fontSize: 12, fontWeight: 600,
        }}
      >
        🖼 Imagen
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: DS.bgSide, border: DS.border,
          borderRadius: 10, padding: 6, zIndex: 100, minWidth: 180,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <DropBtn onClick={() => { onFromFile(); setOpen(false); }}>📁 Subir archivo</DropBtn>
          <DropBtn onClick={() => { onFromUrl(); setOpen(false); }}>🔗 Pegar URL</DropBtn>
          <div style={{ fontSize: 10, color: DS.textMuted, padding: "6px 10px", borderTop: DS.border, marginTop: 4 }}>
            También puedes arrastrar o pegar (Cmd+V) una imagen directamente en el editor
          </div>
        </div>
      )}
    </div>
  );
}

function DropBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "block", width: "100%", padding: "8px 12px", borderRadius: 6,
      border: "none", background: "transparent", color: DS.textPrimary, fontSize: 12,
      cursor: "pointer", textAlign: "left", fontFamily: DS.font,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >{children}</button>
  );
}

function TemplateDropdown({ onInsert }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: "5px 10px", borderRadius: 6, border: "none",
        background: open ? DS.purple + "22" : "transparent",
        color: open ? DS.purple : DS.textSecondary,
        cursor: "pointer", fontSize: 12, fontWeight: 600,
      }}>📋 Plantillas</button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4,
          background: DS.bgSide, border: DS.border,
          borderRadius: 10, padding: 6, zIndex: 100, minWidth: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {TEMPLATES.map((t) => (
            <DropBtn key={t.key} onClick={() => { onInsert(t.html); setOpen(false); }}>
              {t.label}
            </DropBtn>
          ))}
        </div>
      )}
    </div>
  );
}

function Separator() {
  return <div style={{ width: 1, background: DS.textHint, margin: "0 4px", alignSelf: "stretch" }} />;
}

// Función — re-evalúa los colores de DS en cada render para que respete el tema actual.
function buildEditorStyles() {
  return editorStylesTemplate();
}

function editorStylesTemplate() {
  return `
  .tiptap { color: ${DS.textPrimary}; font-family: 'Inter','DM Sans',sans-serif; }
  .tiptap p.is-editor-empty:first-child::before {
    content: attr(data-placeholder); float: left; color: ${DS.textMuted};
    pointer-events: none; height: 0;
  }
  .tiptap h1 { font-size: 24px; font-weight: 700; margin: 16px 0 8px; letter-spacing: -0.02em; }
  .tiptap h2 { font-size: 20px; font-weight: 700; margin: 14px 0 6px; letter-spacing: -0.01em; }
  .tiptap h3 { font-size: 16px; font-weight: 700; margin: 12px 0 4px; }
  .tiptap p { margin: 4px 0; }
  .tiptap ul, .tiptap ol { padding-left: 24px; margin: 6px 0; }
  .tiptap li { margin: 3px 0; }
  .tiptap blockquote {
    border-left: 3px solid ${DS.textHint}; padding-left: 14px;
    margin: 8px 0; color: ${DS.textSecondary}; font-style: italic;
  }
  .tiptap hr { border: none; border-top: ${DS.border}; margin: 16px 0; }
  .tiptap img {
    max-width: 100%; border-radius: 8px; margin: 8px 0;
    cursor: pointer; transition: box-shadow 0.15s;
    display: block;
    resize: horizontal;
    overflow: hidden;
    min-width: 100px;
  }
  .tiptap img:hover {
    box-shadow: 0 0 0 2px rgba(55,138,221,0.4);
    outline: 1px dashed rgba(55,138,221,0.3);
    outline-offset: 4px;
  }
  .tiptap img.ProseMirror-selectednode {
    box-shadow: 0 0 0 3px rgba(55,138,221,0.8);
    outline: 1px dashed rgba(55,138,221,0.5);
    outline-offset: 4px;
  }
  .tiptap img::-webkit-resizer {
    border: 2px solid rgba(55,138,221,0.6);
    background: rgba(55,138,221,0.2);
    border-radius: 2px;
  }
  .tiptap table {
    border-collapse: collapse; width: 100%; margin: 12px 0;
    border: 1px solid rgba(128,128,128,0.4);
  }
  .tiptap th, .tiptap td {
    border: 1px solid rgba(128,128,128,0.35);
    padding: 10px 12px;
    text-align: left; font-size: 13px; vertical-align: top; min-width: 80px;
    color: ${DS.textPrimary};
  }
  .tiptap th {
    background: rgba(128,128,128,0.10); font-weight: 700;
    font-size: 12px; color: ${DS.textSecondary};
  }
  .tiptap td:focus, .tiptap th:focus { outline: 2px solid rgba(55,138,221,0.5); outline-offset: -2px; }
  .tiptap .selectedCell { background: rgba(55,138,221,0.12) !important; }
  .tiptap .column-resize-handle {
    position: absolute; right: -2px; top: 0; bottom: 0; width: 4px;
    background: rgba(55,138,221,0.5); cursor: col-resize;
  }
  .tiptap code { background: ${DS.bgCard}; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  .tiptap pre { background: ${DS.bgCard}; padding: 14px; border-radius: 10px; overflow-x: auto; }
  .tiptap pre code { background: none; padding: 0; }
  .tableWrapper { overflow-x: auto; margin: 12px 0; }
`;
}

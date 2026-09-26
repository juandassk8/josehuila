import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { logger } from "../../lib/logger.js";
import { getSettings, saveNotes } from "./rutinaDb.js";

// Notas al lado del calendario: recordatorios y reglas propias, editables.
export function RutinaNotes({ memberId, column }) {
  const [notes, setNotes] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getSettings(memberId).then(({ data, error }) => {
      if (!alive) return;
      if (error) logger.warn("[rutina] notas:", error.message);
      setNotes(Array.isArray(data?.notes) ? data.notes : []);
    });
    return () => { alive = false; };
  }, [memberId]);

  if (notes === null) return null;
  const editing = draft !== null;
  const save = async () => {
    const clean = draft.map((n) => ({ t: (n.t || "").trim(), b: (n.b || "").trim() })).filter((n) => n.t || n.b);
    setBusy(true);
    const { error } = await saveNotes(memberId, clean);
    setBusy(false);
    if (error) { logger.error("[rutina] notas:", error.message); return; }
    setNotes(clean);
    setDraft(null);
  };

  const ghost = { fontFamily: DS.font, fontWeight: 700, fontSize: 11.5, padding: "5px 10px", borderRadius: 50, cursor: "pointer", border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary };
  const field = { width: "100%", boxSizing: "border-box", padding: "6px 8px", borderRadius: 8, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 12.5, fontFamily: DS.font, outline: "none" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        display: "grid", gap: 12, fontSize: 12.5,
        gridTemplateColumns: column ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
      }}>
        {(editing ? draft : notes).map((n, i) => (
          <div key={i} style={{ borderTop: `2px solid ${DS.textHint}`, paddingTop: 8, color: DS.textMuted, display: "flex", flexDirection: "column", gap: 5 }}>
            {editing ? (
              <>
                <input aria-label={`Título de la nota ${i + 1}`} value={n.t} placeholder="Título" onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} style={{ ...field, fontWeight: 700 }} />
                <textarea aria-label={`Texto de la nota ${i + 1}`} value={n.b} placeholder="Texto" rows={3} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} style={{ ...field, resize: "vertical" }} />
                <button onClick={() => setDraft(draft.filter((_, j) => j !== i))} style={{ ...ghost, alignSelf: "flex-start", color: DS.red, borderColor: `${DS.red}66` }}>Quitar</button>
              </>
            ) : (
              <>
                <b style={{ color: DS.textPrimary }}>{n.t}</b>
                <span style={{ lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{n.b}</span>
              </>
            )}
          </div>
        ))}
        {!editing && !notes.length && <div style={{ color: DS.textMuted }}>Aquí puedes dejar tus notas y reglas del día.</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {editing ? (
          <>
            <button onClick={() => setDraft([...draft, { t: "", b: "" }])} style={ghost}>+ Nota</button>
            <button onClick={save} disabled={busy} style={{ ...ghost, background: DS.textPrimary, color: DS.bg, borderColor: DS.textPrimary }}>Guardar</button>
            <button onClick={() => setDraft(null)} style={ghost}>Cancelar</button>
          </>
        ) : (
          <button onClick={() => setDraft(notes.map((n) => ({ ...n })))} style={ghost}>Editar notas</button>
        )}
      </div>
    </div>
  );
}

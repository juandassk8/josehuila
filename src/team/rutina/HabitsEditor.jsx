import { useState } from "react";
import { DS } from "../../lib/design.js";
import { saveHabit, archiveHabit } from "./rutinaDb.js";
import { DAY_LETTER } from "./rutinaShared.js";

// Editor de hábitos: nombre, grupo, meta semanal y días en que toca.
export function HabitsEditor({ memberId, habits, onClose, onChanged }) {
  const [draft, setDraft] = useState(null); // hábito en edición | { nuevo }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const field = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: `1px solid ${DS.textHint}`,
    background: "transparent", color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, outline: "none",
  };
  const lab = { fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 5, display: "block" };
  const ghost = { padding: "7px 13px", borderRadius: 50, border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };

  const open = (h) => { setError(""); setDraft(h ? { ...h, days: h.days || [1, 1, 1, 1, 1, 1, 1] } : { name: "", grp: habits[0]?.grp || "General", target: 7, days: [1, 1, 1, 1, 1, 1, 1], sort_order: (habits.length + 1) * 10 }); };
  const submit = async () => {
    if (!draft.name.trim()) return setError("Ponle un nombre al hábito.");
    setBusy(true);
    const { error: err } = await saveHabit(memberId, draft);
    setBusy(false);
    if (err) return setError(err.message);
    setDraft(null);
    onChanged();
  };
  const archive = async () => {
    if (!window.confirm(`¿Quitar "${draft.name}" de tu lista? El historial se conserva.`)) return;
    setBusy(true);
    const { error: err } = await archiveHabit(draft.id);
    setBusy(false);
    if (err) return setError(err.message);
    setDraft(null);
    onChanged();
  };
  const groups = [...new Set(habits.map((h) => h.grp))];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto", background: DS.bgSide, border: DS.border, borderRadius: 16, padding: 20, fontFamily: DS.font, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: DS.textPrimary }}>{draft ? (draft.id ? "Editar hábito" : "Nuevo hábito") : "Tus hábitos"}</div>
          <button onClick={draft ? () => setDraft(null) : onClose} style={ghost}>{draft ? "← Volver" : "Cerrar"}</button>
        </div>

        {!draft ? (
          <>
            {habits.map((h) => (
              <button key={h.id} onClick={() => open(h)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, textAlign: "left", padding: "10px 12px",
                borderRadius: 10, border: DS.border, background: DS.bgCard, cursor: "pointer", fontFamily: DS.font, color: DS.textPrimary,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</span>
                <span style={{ fontSize: 11, color: DS.textMuted, whiteSpace: "nowrap" }}>{h.grp} · {h.target}/semana</span>
              </button>
            ))}
            <button onClick={() => open(null)} style={{ ...ghost, alignSelf: "flex-start" }}>+ Nuevo hábito</button>
          </>
        ) : (
          <>
            <div><label style={lab} htmlFor="hb-name">Nombre</label><input id="hb-name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={field} placeholder="Ej: Leer 20 minutos" /></div>
            <div>
              <label style={lab} htmlFor="hb-grp">Grupo</label>
              <input id="hb-grp" list="hb-groups" value={draft.grp} onChange={(e) => setDraft({ ...draft, grp: e.target.value })} style={field} />
              <datalist id="hb-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
            <div>
              <span style={lab}>Días en que toca</span>
              <div style={{ display: "flex", gap: 6 }}>
                {DAY_LETTER.map((d, i) => {
                  const on = !!draft.days[i];
                  return (
                    <button key={d} onClick={() => {
                      const days = draft.days.map((x, j) => (j === i ? (x ? 0 : 1) : x));
                      const count = days.filter(Boolean).length || 1;
                      setDraft({ ...draft, days, target: Math.min(draft.target, count) });
                    }} style={{
                      width: 34, height: 34, borderRadius: 9, cursor: "pointer", fontFamily: DS.font, fontWeight: 800, fontSize: 12,
                      border: `1px solid ${on ? DS.blue : DS.textHint}`, background: on ? DS.blue : "transparent", color: on ? "#fff" : DS.textMuted,
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={lab} htmlFor="hb-target">Meta: veces por semana</label>
              <input id="hb-target" type="number" min="1" max="7" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} style={{ ...field, width: 90 }} />
            </div>
            {error && <div style={{ fontSize: 12, color: DS.red }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              {draft.id ? <button onClick={archive} disabled={busy} style={{ background: "transparent", border: "none", color: DS.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>Quitar hábito</button> : <span />}
              <button onClick={submit} disabled={busy} style={{ padding: "8px 16px", borderRadius: 50, border: "none", background: DS.textPrimary, color: DS.bg, fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer", fontFamily: DS.font }}>Guardar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

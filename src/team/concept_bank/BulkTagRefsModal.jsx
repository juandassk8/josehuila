import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { applyLabelDelta } from "../../despliegue/db.js";
import { LabelEditor } from "../../despliegue/ReferenceLabelUI.jsx";
import { LABEL_CATEGORIES, getLabels } from "../../despliegue/labels.js";

// Intersección de etiquetas entre varias referencias (valores comunes a TODAS).
// Para 1 ref = sus etiquetas completas. Es lo que se precarga en el editor.
function commonLabels(variations) {
  const out = {};
  for (const cat of LABEL_CATEGORIES) {
    if (!variations.length) { out[cat.key] = []; continue; }
    let common = getLabels(variations[0])[cat.key];
    for (const v of variations.slice(1)) {
      const s = new Set(getLabels(v)[cat.key]);
      common = common.filter((x) => s.has(x));
    }
    out[cat.key] = common;
  }
  return out;
}

// Modal para editar etiquetas de una o varias referencias. Precarga las etiquetas
// que ya tienen (las comunes cuando son varias) para no empezar de cero. Al guardar
// aplica un DELTA no destructivo: lo que agregás se suma a todas; lo que quitás se
// quita de todas; las etiquetas propias de cada ref que no se muestran se conservan.
export function BulkTagRefsModal({ variations = [], variationIds, suggestions = {}, onClose, onDone }) {
  const ids = variationIds && variationIds.length ? variationIds : variations.map((v) => v.id);
  const count = ids.length;
  const isSingle = count === 1;

  const initial = useMemo(() => commonLabels(variations), [variations]);
  const [labels, setLabels] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !saving) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, saving]);

  // Delta contra las etiquetas precargadas.
  const delta = useMemo(() => {
    const added = {}; const removed = {};
    for (const cat of LABEL_CATEGORIES) {
      const before = initial[cat.key] || [];
      const after = labels[cat.key] || [];
      const a = after.filter((v) => !before.includes(v));
      const r = before.filter((v) => !after.includes(v));
      if (a.length) added[cat.key] = a;
      if (r.length) removed[cat.key] = r;
    }
    return { added, removed };
  }, [initial, labels]);

  const hasChanges = Object.keys(delta.added).length > 0 || Object.keys(delta.removed).length > 0;

  const save = async () => {
    if (!hasChanges) { onClose?.(); return; }
    setSaving(true);
    setError(null);
    try {
      await applyLabelDelta(ids, delta.added, delta.removed);
      onDone?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget && !saving) onClose?.(); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, zIndex: 10001,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 100%)", maxHeight: "92vh", overflowY: "auto",
          background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, padding: "24px 26px", color: DS.textPrimary,
          boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6 }}>
          Editar etiquetas · {count} referencia{count === 1 ? "" : "s"}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>Etiquetas por categoría</h2>

        <LabelEditor value={labels} onChange={setLabels} suggestions={suggestions} />

        <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 10 }}>
          {isSingle
            ? "Ya vienen cargadas las etiquetas actuales — editá lo que quieras."
            : "Se muestran las etiquetas comunes a las seleccionadas. Lo que agregues o quites se aplica a todas; las propias de cada una se conservan."}
        </div>

        {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onClose} disabled={saving} style={ghostBtn}>Cancelar</button>
          <button onClick={save} disabled={saving || !hasChanges}
            style={{ ...primaryBtn, opacity: saving || !hasChanges ? 0.55 : 1 }}>
            {saving ? "Guardando…" : "Guardar etiquetas"}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};

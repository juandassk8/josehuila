// Dropdown de UGCs/diseñadores con opción "+ Nuevo" inline.
// El kind se deriva del slot.format (video→ugc, static→designer).

import { useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useCompanyUgcs } from "./hooks/useCompanyUgcs.js";
import { createUgc } from "./ugcs_db.js";

const KIND_LABEL = {
  ugc: "UGC",
  designer: "diseñador",
};

export function UgcSelect({ companyId, kind = "ugc", value, onChange, isAdmin = true }) {
  const { isDark } = useTheme();
  const T = DS;
  const { ugcs } = useCompanyUgcs(companyId, kind);
  const [busy, setBusy] = useState(false);

  const handleChange = async (e) => {
    const v = e.target.value;
    if (v === "__new__") {
      // Reset visual antes del prompt
      e.target.value = value || "";
      const name = prompt(`Nombre del ${KIND_LABEL[kind]}:`);
      const clean = (name || "").trim();
      if (!clean) return;
      setBusy(true);
      try {
        const { data, error } = await createUgc(companyId, { name: clean, kind });
        if (error) {
          alert(`No se pudo crear: ${error.message || error.hint || error}`);
          return;
        }
        if (data?.id) onChange(data.id);
      } finally {
        setBusy(false);
      }
      return;
    }
    onChange(v || null);
  };

  return (
    <select
      value={value || ""}
      onChange={handleChange}
      disabled={!isAdmin || busy}
      style={{
        flex: 1,
        padding: "6px 10px",
        borderRadius: 8,
        border: `1px solid ${T.textHint}`,
        background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
        color: T.textPrimary,
        fontSize: 13,
        fontFamily: T.font,
        outline: "none",
        cursor: isAdmin ? "pointer" : "default",
        appearance: "auto",
      }}
    >
      <option value="">(Sin asignar)</option>
      {ugcs.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
      {isAdmin && (
        <option value="__new__">+ Nuevo {KIND_LABEL[kind]}</option>
      )}
    </select>
  );
}

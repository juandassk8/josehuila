import { DS } from "../../lib/design.js";
import { PillDropdown } from "./PillDropdown.jsx";

export const EDIT_SUBSTATUS = {
  en_proceso:  { label: "En proceso",  color: DS.blue,  emoji: "🔵" },
  en_revision: { label: "En revisión", color: DS.amber, emoji: "🟡" },
  aprobado:    { label: "Aprobado",    color: DS.green, emoji: "🟢" },
};

const OPTIONS = [
  // Hex puro para "Sin estado" — DS.textMuted es rgba en dark y rompía
  // el alpha-append cuando se usaba como background.
  { value: null,          label: "Sin estado",  color: "#6B7280" },
  { value: "en_proceso",  label: "En proceso",  color: DS.blue },
  { value: "en_revision", label: "En revisión", color: DS.amber },
  { value: "aprobado",    label: "Aprobado",    color: DS.green },
];

export function EditSubstatusPicker({ value, onChange, readOnly = false, size = "md" }) {
  return (
    <PillDropdown
      value={value ?? null}
      options={OPTIONS}
      onChange={onChange}
      readOnly={readOnly}
      size={size}
      placeholder="Sin estado"
    />
  );
}

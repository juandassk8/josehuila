import { DS } from "../../lib/design.js";
import { CONTENT_STATUSES, CONTENT_STATUS_LABEL, TRIAL_STATUS, ARCHIVED_STATUSES } from "./ContentCard.jsx";
import { PillDropdown } from "./PillDropdown.jsx";

const STATUS_COLORS = {
  idea:      "#9b9b9b",
  scripting: DS.blue,
  to_film:   "#E24B4A",
  to_edit:   "#EC4899",
  to_post:   "#E9C435",
  posted:    DS.green,
  trial:     "#A78BFA",
  killed:    "#6B7280",
  promoted:  "#0EA5E9",
};

// Incluimos los estados nuevos al final — así desde el modal podés moverlo
// manualmente a Trial, Killed o Promoted sin tener que arrastrar en el board.
const ALL_STATUSES = [...CONTENT_STATUSES, TRIAL_STATUS, ...ARCHIVED_STATUSES];

const STATUS_OPTIONS = ALL_STATUSES.map((s) => ({
  value: s,
  label: CONTENT_STATUS_LABEL[s],
  color: STATUS_COLORS[s],
}));

export function StatusPicker({ value, onChange, readOnly = false, size = "md" }) {
  return (
    <PillDropdown
      value={value}
      options={STATUS_OPTIONS}
      onChange={onChange}
      readOnly={readOnly}
      size={size}
      placeholder="Sin estado"
    />
  );
}

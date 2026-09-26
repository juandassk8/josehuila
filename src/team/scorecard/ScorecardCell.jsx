import { DS } from "../../lib/design.js";

// Dropdown inline, controlled.
// value: 'si' | 'no' | null
// onChange(next): parent handles optimistic update + persistence
export function ScorecardCell({ value, onChange, disabled }) {
  const current = value ?? "";

  const bg =
    current === "si"
      ? `${DS.green}22`
      : current === "no"
      ? `${DS.red}22`
      : "transparent";
  const color =
    current === "si" ? DS.green : current === "no" ? DS.red : DS.textSecondary;
  const borderColor =
    current === "si"
      ? `${DS.green}55`
      : current === "no"
      ? `${DS.red}55`
      : DS.textHint;

  return (
    <select
      value={current}
      onChange={(e) => {
        const next = e.target.value === "" ? null : e.target.value;
        onChange?.(next);
      }}
      disabled={disabled}
      style={{
        width: "100%",
        padding: "6px 4px",
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: bg,
        color,
        fontSize: 12,
        fontFamily: DS.font,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        textAlign: "center",
        textAlignLast: "center",
        outline: "none",
        appearance: "none",
      }}
    >
      <option value="" style={{ background: DS.bgSide, color: DS.textSecondary }}>—</option>
      <option value="si" style={{ background: DS.bgSide, color: DS.textPrimary }}>Sí</option>
      <option value="no" style={{ background: DS.bgSide, color: DS.textPrimary }}>No</option>
    </select>
  );
}

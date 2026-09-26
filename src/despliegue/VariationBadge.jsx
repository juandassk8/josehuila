import { STATE_COLOR, STATES } from "./constants.js";

// Badge tipo "A1" con color según estado. Click abre el modal.
export function VariationBadge({ label, state = "pending", onClick, compact = false }) {
  const color = STATE_COLOR[state] || "transparent";
  const isPending = state === "pending";
  const stateDef = STATES.find((s) => s.key === state);
  const size = compact ? 28 : 34;
  return (
    <button
      onClick={onClick}
      title={stateDef?.label}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        padding: 0,
        border: isPending ? `1.5px dashed #3A3F3C` : `1.5px solid ${color}`,
        background: isPending ? "transparent" : `${color}22`,
        color: isPending ? "#9A9A92" : color,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "inherit",
        transition: "transform 0.1s, box-shadow 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.08)";
        if (!isPending) e.currentTarget.style.boxShadow = `0 0 12px ${color}44`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {label}
    </button>
  );
}

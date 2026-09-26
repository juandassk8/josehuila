import { DS } from "../../lib/design.js";
import { DAY_LABELS_LONG } from "../../lib/weeks.js";
import {
  CONTENT_CATEGORIES,
  contentStatusMeta,
  contentStatusColor,
  buildMilestoneLookup,
} from "./trackingStatus.js";

const CAT_COL = 150;

export function ContenidoGrid({ days, milestones, onCellClick }) {
  const lookup = buildMilestoneLookup(milestones);

  const tableStyle = {
    display: "grid",
    gridTemplateColumns: `${CAT_COL}px repeat(${days.length}, minmax(110px, 1fr))`,
    gap: 1,
    background: DS.textHint,
    border: DS.border,
    borderRadius: 10,
    overflow: "hidden",
    fontFamily: DS.font,
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={tableStyle}>
        <HeaderCell label="Categoría" leading />
        {days.map((d, i) => (
          <HeaderCell
            key={i}
            label={DAY_LABELS_LONG[i]}
            sub={`${d.getDate()}/${d.getMonth() + 1}`}
          />
        ))}

        {CONTENT_CATEGORIES.map((cat, rowIdx) => (
          <CategoryRow
            key={cat.key}
            cat={cat}
            days={days}
            lookup={lookup}
            isLast={rowIdx === CONTENT_CATEGORIES.length - 1}
            onCellClick={onCellClick}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryRow({ cat, days, lookup, isLast, onCellClick }) {
  return (
    <>
      <div
        style={{
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: DS.textPrimary,
          fontSize: 12,
          fontWeight: 600,
          background: DS.bgSide,
        }}
      >
        <span style={{ fontSize: 14 }}>{cat.icon}</span>
        <span>{cat.label}</span>
      </div>
      {days.map((d, i) => {
        const dow = i + 1;
        const items = lookup.get(`${cat.key}__${dow}`) || [];
        return (
          <CellStack
            key={i}
            items={items}
            onAdd={() => onCellClick({ mode: "create", category: cat.key, day_of_week: dow, date: d })}
            onEdit={(item) => onCellClick({ mode: "edit", milestone: item })}
          />
        );
      })}
    </>
  );
}

function HeaderCell({ label, sub, leading }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: DS.bgSide,
        color: DS.textSecondary,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        textAlign: leading ? "left" : "center",
      }}
    >
      <div>{label}</div>
      {sub && (
        <div style={{ fontSize: 10, letterSpacing: 0, color: DS.textMuted, fontWeight: 500, marginTop: 2, textTransform: "none" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function CellStack({ items, onAdd, onEdit }) {
  return (
    <div
      style={{
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 58,
        background: DS.bg,
      }}
    >
      {items.map((m) => {
        const meta = contentStatusMeta(m.status);
        const color = contentStatusColor(m.status);
        return (
          <button
            key={m.id}
            onClick={() => onEdit(m)}
            style={{
              background: `${color}14`,
              border: `1px solid ${color}55`,
              borderLeft: `3px solid ${color}`,
              color: DS.textPrimary,
              borderRadius: 6,
              padding: "5px 8px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontFamily: DS.font,
              cursor: "pointer",
              textAlign: "left",
            }}
            title={m.note || meta.label}
          >
            <span style={{ color }}>{meta.icon}</span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {meta.label}
            </span>
          </button>
        );
      })}
      <button
        onClick={onAdd}
        style={{
          background: "transparent",
          border: DS.borderDash,
          color: DS.textMuted,
          borderRadius: 6,
          padding: "4px 6px",
          fontSize: 14,
          lineHeight: 1,
          cursor: "pointer",
          fontFamily: DS.font,
        }}
        title="Agregar hito"
      >
        +
      </button>
    </div>
  );
}

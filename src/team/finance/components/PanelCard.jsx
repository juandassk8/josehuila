// Wrapper de panel estilo Google Sheet: header con bloque de color sólido +
// contenido + footer opcional con shade más claro del mismo color.
// Usado por Cuaderno para los 8 paneles (Ingresos, Gastos, Balance, etc.)

import { DS, withAlpha } from "../../../lib/design.js";

export function PanelCard({ title, color, children, footer, compact = false }) {
  return (
    <div style={{
      background: DS.bgCard,
      borderRadius: 10,
      border: `1px solid ${withAlpha(color, "33")}`,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
    }}>
      <div style={{
        padding: compact ? "5px 10px" : "7px 12px",
        background: color,
        color: "#fff",
        fontWeight: 800,
        fontSize: compact ? 10 : 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}>
        {title}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {footer && (
        <div style={{
          padding: "6px 10px",
          background: withAlpha(color, "12"),
          borderTop: `1px solid ${withAlpha(color, "22")}`,
          fontWeight: 700,
          fontSize: 11,
          color: DS.textPrimary,
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// Estilos compartidos de tabla "sheet-like" usables dentro de PanelCard.
export const SHEET_HEADER_STYLE = {
  display: "grid",
  padding: "5px 8px",
  gap: 6,
  background: DS.bgSide,
  borderBottom: `1px solid ${withAlpha(DS.textHint, "44")}`,
  fontSize: 9,
  fontWeight: 700,
  color: DS.textMuted,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

export const SHEET_ROW_STYLE = {
  display: "grid",
  padding: "3px 8px",
  gap: 6,
  borderBottom: `1px solid ${withAlpha(DS.textHint, "14")}`,
  alignItems: "center",
};

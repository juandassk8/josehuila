import { DS, PRIORITY_COLORS } from "../../lib/design.js";
import { fmtRelative } from "../../lib/dates.js";

export function ActivityFeed({ tasks, members }) {
  const feed = (tasks || [])
    .slice()
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 15);

  return (
    <div
      style={{
        background: DS.bgCard,
        border: DS.border,
        borderRadius: 14,
        padding: 16,
        position: "sticky",
        top: 16,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: DS.textMuted,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: DS.green,
            boxShadow: `0 0 8px ${DS.green}`,
          }}
        />
        Activity · Live
      </div>

      {feed.length === 0 && (
        <div style={{ color: DS.textMuted, fontSize: 11 }}>Sin actividad todavía.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {feed.map((t) => {
          const actor =
            t.status === "completado"
              ? members?.find((m) => m.id === t.completed_by)
              : members?.find((m) => m.id === t.created_by);
          const verb =
            t.status === "completado"
              ? "completó"
              : t.status === "en_curso"
              ? "avanza en"
              : "creó";
          const priorityColor = PRIORITY_COLORS[t.priority] || DS.blue;
          return (
            <div key={t.id} style={{ display: "flex", gap: 10, fontSize: 11, lineHeight: 1.5 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: actor?.color || DS.blue,
                  color: DS.textPrimary,
                  fontSize: 9,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {actor?.name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: DS.textPrimary }}>
                  <strong>{actor?.name || "Alguien"}</strong>{" "}
                  <span style={{ color: DS.textSecondary }}>{verb}</span>{" "}
                  <span style={{ color: DS.textPrimary }}>{t.title}</span>
                </div>
                <div style={{ color: DS.textMuted, fontSize: 10, marginTop: 2 }}>
                  <span style={{ color: priorityColor, fontWeight: 600, marginRight: 6 }}>
                    ● {t.priority}
                  </span>
                  {fmtRelative(t.updated_at || t.created_at)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

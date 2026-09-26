import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useOnboardingIdentity } from "../onboarding/useOnboardingIdentity.js";
import {
  listNotifications,
  countUnread,
  markAsRead,
  markAllAsRead,
} from "./notifications_db.js";
import { database } from "../lib/backend.js";

// Bell icon global. Se monta al lado del botón Feedback. Muestra un badge
// rojo con el conteo de no-leídas. Click abre dropdown con las últimas 30
// notificaciones. Realtime — cuando llega una nueva, el badge sube y aparece
// en el dropdown sin refrescar.

export function NotificationsBell() {
  const { isDark } = useTheme();
  const identity = useOnboardingIdentity();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  const recipientKey = identity?.identityKey || null;

  const reload = async () => {
    if (!recipientKey) return;
    setLoading(true);
    const [data, n] = await Promise.all([
      listNotifications(recipientKey),
      countUnread(recipientKey),
    ]);
    setItems(data);
    setUnread(n);
    setLoading(false);
  };

  useEffect(() => { if (recipientKey) reload(); }, [recipientKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: suscribirse a INSERT/UPDATE de notifications filtrado por
  // recipient_key. Supabase no soporta filter con valores complejos en
  // postgres_changes, así que filtramos en callback.
  useEffect(() => {
    if (!recipientKey) return;
    const ch = database
      .channel(`notifs_${recipientKey}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row || row.recipient_key === recipientKey) reload();
        }
      )
      .subscribe();
    return () => database.removeChannel(ch);
  }, [recipientKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click-outside para cerrar dropdown
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!identity) return null;

  const handleOpen = () => setOpen((v) => !v);
  const handleItemClick = async (n) => {
    if (!n.read_at) {
      await markAsRead(n.id);
      reload();
    }
    if (n.link_url) {
      window.location.assign(n.link_url);
    }
    setOpen(false);
  };
  const handleMarkAll = async () => {
    await markAllAsRead(recipientKey);
    reload();
  };

  return (
    <div ref={dropdownRef} style={{
      position: "fixed",
      bottom: 22,
      // Justo a la izquierda del botón Feedback (que ocupa ~130px desde right:22).
      // El gap removido del botón "Tutorial" (que estaba en r=138) ya no se usa.
      right: 168,
      zIndex: 9997,
    }}>
      <button
        onClick={handleOpen}
        title={unread > 0 ? `${unread} sin leer` : "Notificaciones"}
        style={{
          position: "relative",
          padding: "10px 14px",
          borderRadius: 50,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(55,53,47,0.18)"}`,
          background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
          color: DS.textPrimary,
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          fontFamily: DS.font,
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
          display: "inline-flex", alignItems: "center", gap: 6,
          transition: "transform 120ms ease",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      >
        <span>🔔</span>
        {unread > 0 && (
          <span style={{
            position: "absolute",
            top: -4, right: -4,
            minWidth: 18, height: 18,
            padding: "0 5px", borderRadius: 50,
            background: "#E24B4A", color: "#FFFFFF",
            fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center",
            letterSpacing: "0.02em",
            boxShadow: "0 2px 6px rgba(226,75,74,0.5)",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          right: 0,
          marginBottom: 10,
          width: 360,
          maxHeight: 500,
          background: isDark ? "#14141A" : "#FFFFFF",
          border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          overflow: "hidden",
          fontFamily: DS.font,
          display: "flex", flexDirection: "column",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: DS.textPrimary }}>
              Notificaciones {unread > 0 && <span style={{ color: "#E24B4A", marginLeft: 4 }}>· {unread} nuevas</span>}
            </div>
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  background: "transparent", border: "none",
                  color: DS.textSecondary, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: DS.font,
                  padding: "2px 6px", borderRadius: 4,
                }}
              >Marcar todas leídas</button>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {loading && items.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: DS.textMuted, fontSize: 12 }}>
                Cargando…
              </div>
            ) : items.length === 0 ? (
              <div style={{
                padding: "40px 20px", textAlign: "center",
                color: DS.textMuted, fontSize: 12.5, lineHeight: 1.5,
              }}>
                🔕<br/>
                <div style={{ marginTop: 8 }}>Sin notificaciones aún</div>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  style={{
                    width: "100%",
                    padding: "11px 16px",
                    background: n.read_at
                      ? "transparent"
                      : (isDark ? "rgba(59,139,212,0.06)" : "rgba(59,139,212,0.04)"),
                    border: "none",
                    borderLeft: n.read_at ? "3px solid transparent" : "3px solid #3B8BD4",
                    textAlign: "left", cursor: "pointer", fontFamily: DS.font,
                    display: "flex", alignItems: "flex-start", gap: 10,
                    transition: "background 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = n.read_at
                      ? "transparent"
                      : (isDark ? "rgba(59,139,212,0.06)" : "rgba(59,139,212,0.04)");
                  }}
                >
                  <div style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.1 }}>
                    {n.icon || "🔔"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: DS.textPrimary,
                      marginBottom: 2, lineHeight: 1.3,
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: 11.5, color: DS.textSecondary,
                        lineHeight: 1.4, marginBottom: 2,
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10.5, color: DS.textMuted }}>
                      {fmtRelative(n.created_at)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso) {
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "ahora";
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days} d`;
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch { return ""; }
}

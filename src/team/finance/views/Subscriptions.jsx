import { useMemo, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";
import { SubscriptionModal } from "../modals/SubscriptionModal.jsx";
import { formatCOP, formatCOPCompact } from "../lib/finance_math.js";

export function SubscriptionsView({ finance }) {
  const { subscriptions } = finance;
  const [editing, setEditing] = useState(null);
  const [openNew, setOpenNew] = useState(false);

  const active = useMemo(() => subscriptions.filter((s) => s.status === "active"), [subscriptions]);
  const totalMonthly = useMemo(() => active.reduce((s, sub) => s + Number(sub.monthly_cost || 0), 0), [active]);
  const totalAnnual = totalMonthly * 12;

  const isStale = (s) => {
    if (!s.last_used_date) return true;
    const daysSince = (Date.now() - new Date(s.last_used_date).getTime()) / 86400000;
    return daysSince > 30;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        padding: 16, borderRadius: 14, background: DS.bgCard, border: DS.border,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 11, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Total mensual en suscripciones
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: DS.textPrimary, marginTop: 4 }}>
            {formatCOP(totalMonthly)}
          </div>
          <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
            = {formatCOPCompact(totalAnnual)}/año · {active.length} activas
          </div>
        </div>
        <button onClick={() => setOpenNew(true)} style={{
          padding: "8px 16px", borderRadius: 50, border: "none",
          background: DS.green, color: "#fff", fontSize: 12, fontWeight: 700,
          cursor: "pointer", fontFamily: DS.font,
        }}>+ Nueva suscripción</button>
      </div>

      {subscriptions.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: DS.textMuted, fontSize: 12, background: DS.bgCard, border: DS.borderDash, borderRadius: 12 }}>
          Sin suscripciones cargadas. Agregá las que tengas (Supabase, ManyChat, etc.) para detectar fugas.
        </div>
      ) : (
        <div style={{ background: DS.bgCard, border: DS.border, borderRadius: 12, overflow: "hidden" }}>
          {subscriptions.map((s, i) => {
            const stale = s.status === "active" && isStale(s);
            return (
              <button key={s.id} onClick={() => setEditing(s)} style={{
                width: "100%", padding: "14px 16px", textAlign: "left",
                background: "transparent", border: "none",
                borderBottom: i < subscriptions.length - 1 ? `1px solid ${withAlpha(DS.textHint, "22")}` : "none",
                cursor: "pointer", fontFamily: DS.font, color: DS.textPrimary,
                display: "flex", alignItems: "center", gap: 12,
                opacity: s.status === "cancelled" ? 0.55 : 1,
              }}>
                <span style={{ fontSize: 18 }}>🔧</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {s.name}
                    {stale && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 50,
                        background: withAlpha(DS.amber, "22"), color: DS.amber, letterSpacing: "0.06em",
                      }}>⚠️ SIN USO 30+ DÍAS</span>
                    )}
                    {s.status === "cancelled" && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.06em" }}>CANCELADA</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2 }}>
                    {s.category || "Sin categoría"}
                    {s.billing_day && ` · cobra día ${s.billing_day}`}
                    {s.last_used_date && ` · último uso ${new Date(s.last_used_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                    {formatCOP(s.monthly_cost)}
                  </div>
                  <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 2 }}>
                    {formatCOPCompact(s.monthly_cost * 12)}/año
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {openNew && <SubscriptionModal subscription={null} finance={finance} onClose={() => setOpenNew(false)} />}
      {editing && <SubscriptionModal subscription={editing} finance={finance} onClose={() => setEditing(null)} />}
    </div>
  );
}

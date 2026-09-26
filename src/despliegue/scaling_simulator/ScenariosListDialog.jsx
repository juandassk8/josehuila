// Lista de escenarios guardados del cliente. Cargar/duplicar/archivar/eliminar.
// Realtime suscripción para que los nuevos aparezcan en vivo.

import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listScenarios, deleteScenario, createScenario, updateScenario } from "./db.js";

function fmtCOPShort(n) {
  if (!isFinite(n) || n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

function fmtDate(s) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return s; }
}

export function ScenariosListDialog({ T, isDark, companyId, onLoad, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!companyId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await listScenarios(companyId);
    if (error) {
      setErr(error.message || "No se pudo cargar la lista.");
      setItems([]);
    } else {
      setItems(data || []);
      setErr("");
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
    if (!companyId) return;
    const ch = database
      .channel(`scaling_scenarios_${companyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "scaling_scenarios", filter: `company_id=eq.${companyId}` },
        () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load]);

  const handleDuplicate = async (s) => {
    const { id, created_at, updated_at, ...rest } = s; // eslint-disable-line no-unused-vars
    await createScenario({ ...rest, name: `${s.name} (copia)` });
  };

  const handleDelete = async (s) => {
    if (!confirm(`¿Eliminar "${s.name}"? No se puede deshacer.`)) return;
    await deleteScenario(s.id);
  };

  const handleArchive = async (s) => {
    await updateScenario(s.id, { is_archived: !s.is_archived });
  };

  const bg = isDark ? "#0E0E14" : "#FFFFFF";
  const border = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10010,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          background: bg, border, borderRadius: 14,
          padding: "20px 22px", color: T.textPrimary,
          display: "flex", flexDirection: "column", gap: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Escenarios guardados</div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: T.textMuted,
              cursor: "pointer", fontSize: 18, padding: "0 4px",
            }}
          >×</button>
        </div>

        {err && (
          <div style={{
            padding: "8px 10px", borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.30)",
            color: "#E24B4A", fontSize: 12, lineHeight: 1.5,
          }}>⚠️ {err}</div>
        )}

        <div style={{ overflowY: "auto", flex: 1, marginRight: -6, paddingRight: 6 }}>
          {loading && (
            <div style={{ color: T.textMuted, fontSize: 12, padding: "24px 0", textAlign: "center" }}>
              Cargando…
            </div>
          )}

          {!loading && items.length === 0 && (
            <div style={{
              color: T.textMuted, fontSize: 12, padding: "32px 16px",
              textAlign: "center", border: `1px dashed ${T.textHint}`, borderRadius: 12,
            }}>
              Todavía no guardaste ningún escenario.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((s) => (
              <div key={s.id} style={{
                padding: "12px 14px", borderRadius: 10,
                background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${T.textHint}`,
                opacity: s.is_archived ? 0.55 : 1,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {s.name}
                    {s.is_archived && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, fontWeight: 700,
                        padding: "2px 6px", borderRadius: 50,
                        background: "rgba(127,127,127,0.18)", color: T.textMuted,
                        letterSpacing: "0.06em",
                      }}>ARCHIVADO</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: T.textMuted }}>{fmtDate(s.updated_at)}</div>
                </div>

                {s.description && (
                  <div style={{ fontSize: 11.5, color: T.textSecondary, lineHeight: 1.4 }}>
                    {s.description}
                  </div>
                )}

                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11,
                  color: T.textSecondary, marginTop: 2,
                }}>
                  {s.cached_weeks_to_target != null && (
                    <Chip>{s.cached_weeks_to_target} sem al objetivo</Chip>
                  )}
                  {s.cached_monthly_lift != null && s.cached_monthly_lift > 0 && (
                    <Chip ok>+{fmtCOPShort(s.cached_monthly_lift)}/mes</Chip>
                  )}
                  {s.cached_total_investment != null && (
                    <Chip>Inv: {fmtCOPShort(s.cached_total_investment)}</Chip>
                  )}
                  {s.cached_final_roas != null && s.cached_final_roas > 0 && (
                    <Chip>ROAS {s.cached_final_roas.toFixed(2)}×</Chip>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4 }}>
                  <ActionBtn onClick={() => onLoad?.(s)} primary T={T} isDark={isDark}>Cargar</ActionBtn>
                  <ActionBtn onClick={() => handleDuplicate(s)} T={T} isDark={isDark}>Duplicar</ActionBtn>
                  <ActionBtn onClick={() => handleArchive(s)} T={T} isDark={isDark}>
                    {s.is_archived ? "Desarchivar" : "Archivar"}
                  </ActionBtn>
                  <ActionBtn onClick={() => handleDelete(s)} danger T={T} isDark={isDark}>Eliminar</ActionBtn>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, ok }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 50,
      background: ok ? "rgba(29,158,117,0.14)" : "rgba(127,127,127,0.12)",
      color: ok ? "#1D9E75" : "currentColor",
      fontSize: 10.5, fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

function ActionBtn({ children, onClick, primary, danger, T, isDark }) {
  let style = {
    padding: "6px 12px", borderRadius: 50, cursor: "pointer",
    fontSize: 11, fontWeight: 600, fontFamily: T.font,
    border: `1px solid ${T.textHint}`,
    background: "transparent",
    color: T.textSecondary,
  };
  if (primary) {
    style = {
      ...style,
      background: isDark ? "#EBEBEB" : "#1A1D1C",
      color: isDark ? "#1A1D1C" : "#FFFFFF",
      border: "none",
    };
  } else if (danger) {
    style = { ...style, color: "#E24B4A", border: "1px solid rgba(226,75,74,0.4)" };
  }
  return (
    <button onClick={onClick} style={style}>{children}</button>
  );
}

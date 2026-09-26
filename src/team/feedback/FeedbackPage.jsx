import { useEffect, useMemo, useState, useCallback } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { database } from "../../lib/backend.js";
import { canAccessView } from "../lib/permissions.js";
import {
  FEEDBACK_SECTIONS,
  sectionLabel,
  listFeedback,
  updateFeedbackStatus,
  deleteFeedback,
} from "../../feedback/feedback_db.js";

const STATUSES = [
  { key: "new",         label: "Nuevo",       color: "#3B8BD4" },
  { key: "in_progress", label: "En progreso", color: "#F5A623" },
  { key: "resolved",    label: "Resuelto",    color: "#1D9E75" },
  { key: "dismissed",   label: "Descartado",  color: "#8A8E8B" },
];

export function FeedbackPage({ currentMember }) {
  // Se mira el permiso, no el rol: la vista es de las que se pueden dar por
  // persona desde Equipo → Accesos, y plantarse en `role === "admin"` hacía que
  // dársela a alguien no sirviera para nada.
  const puedeVer = canAccessView(currentMember, "feedback");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSection, setFilterSection] = useState("all");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await listFeedback({});
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const ch = database
      .channel("platform_feedback_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_feedback" }, () => load())
      .subscribe();
    return () => database.removeChannel(ch);
  }, [load]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterStatus !== "all" && it.status !== filterStatus) return false;
      if (filterSection !== "all" && it.section !== filterSection) return false;
      return true;
    });
  }, [items, filterStatus, filterSection]);

  const counts = useMemo(() => {
    const c = { new: 0, in_progress: 0, resolved: 0, dismissed: 0 };
    items.forEach((it) => { c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }, [items]);

  if (!puedeVer) {
    return (
      <div style={{ fontFamily: DS.font, padding: 40, textAlign: "center", color: DS.textMuted }}>
        No tenés acceso al feedback. Pedíselo a un admin desde Equipo → Accesos.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar
        title="Feedback"
        subtitle={`${items.length} reportes en total · ${counts.new} sin revisar`}
        accent="#8B5CF6"
      />

      {/* Filtros */}
      <div style={{
        display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
        marginBottom: 16,
      }}>
        <FilterPill
          label="Todos"
          count={items.length}
          active={filterStatus === "all"}
          onClick={() => setFilterStatus("all")}
          color={DS.textPrimary}
        />
        {STATUSES.map((s) => (
          <FilterPill
            key={s.key}
            label={s.label}
            count={counts[s.key] || 0}
            active={filterStatus === s.key}
            onClick={() => setFilterStatus(s.key)}
            color={s.color}
          />
        ))}
        <div style={{ width: 1, height: 22, background: DS.textHint, margin: "0 4px" }} />
        <select
          value={filterSection}
          onChange={(e) => setFilterSection(e.target.value)}
          style={{
            padding: "6px 12px", borderRadius: 50,
            background: DS.bgCard, border: DS.border,
            color: DS.textPrimary, fontSize: 11.5, fontFamily: DS.font,
          }}
        >
          <option value="all">Todas las secciones</option>
          {FEEDBACK_SECTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ color: DS.textMuted, fontSize: 13, padding: 30, textAlign: "center" }}>
          Cargando…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: 50, textAlign: "center", color: DS.textMuted,
          border: DS.borderDash, borderRadius: 14, fontSize: 13,
        }}>
          No hay feedback {filterStatus !== "all" || filterSection !== "all" ? "con esos filtros" : "todavía"}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((it) => (
            <FeedbackRow key={it.id} item={it} onClick={() => setSelected(it)} />
          ))}
        </div>
      )}

      {selected && (
        <FeedbackDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function FilterPill({ label, count, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 13px", borderRadius: 50,
        border: active ? `1px solid ${color}` : `1px solid ${DS.textHint}`,
        background: active ? `${color}18` : "transparent",
        color: active ? color : DS.textSecondary,
        fontSize: 11.5, fontWeight: 700, cursor: "pointer",
        fontFamily: DS.font,
        display: "inline-flex", alignItems: "center", gap: 6,
      }}
    >
      {label}
      <span style={{
        fontSize: 10, fontWeight: 700,
        padding: "1px 7px", borderRadius: 50,
        background: active ? color : DS.bgCard,
        color: active ? "#fff" : DS.textMuted,
      }}>{count}</span>
    </button>
  );
}

function FeedbackRow({ item, onClick }) {
  const status = STATUSES.find((s) => s.key === item.status) || STATUSES[0];
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      const sameDay = d.toDateString() === new Date().toDateString();
      const time = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
      if (sameDay) return `hoy ${time}`;
      const date = d.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
      return `${date} ${time}`;
    } catch { return ""; }
  };

  return (
    <button
      onClick={onClick}
      style={{
        background: DS.bgCard, border: DS.border, borderRadius: 12,
        padding: "12px 16px", textAlign: "left", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12,
        fontFamily: DS.font, color: DS.textPrimary,
        transition: "border-color 120ms ease, background 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(139,92,246,0.4)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; }}
    >
      {/* Status dot */}
      <div style={{
        width: 9, height: 9, borderRadius: "50%",
        background: status.color, flexShrink: 0,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          marginBottom: 4,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: "0.10em",
            padding: "2px 8px", borderRadius: 50,
            background: `${status.color}18`, color: status.color,
            textTransform: "uppercase",
          }}>
            {status.label}
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: DS.textMuted,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {sectionLabel(item.section)}
          </span>
          {item.images?.length > 0 && (
            <span style={{ fontSize: 10, color: DS.textMuted }}>
              📷 {item.images.length}
            </span>
          )}
          {item.loom_url && (
            <span style={{ fontSize: 10, color: "#E24B4A" }}>🎥 Loom</span>
          )}
        </div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: DS.textPrimary,
          lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 3 }}>
          {item.reporter_name || "Anónimo"}
          {item.company_name ? ` · ${item.company_name}` : ""}
          {" · "}{fmtDate(item.created_at)}
        </div>
      </div>
    </button>
  );
}

function FeedbackDetailModal({ item, onClose, onChanged }) {
  const [working, setWorking] = useState(false);
  const [adminNotes, setAdminNotes] = useState(item.admin_notes || "");

  const setStatus = async (status) => {
    setWorking(true);
    try {
      await updateFeedbackStatus(item.id, { status, admin_notes: adminNotes });
      onChanged?.();
      onClose();
    } catch (e) {
      alert("No se pudo actualizar: " + (e.message || ""));
    }
    setWorking(false);
  };

  const remove = async () => {
    if (!confirm("¿Eliminar este feedback? No se puede deshacer.")) return;
    setWorking(true);
    try {
      await deleteFeedback(item.id);
      onChanged?.();
      onClose();
    } catch (e) {
      alert("No se pudo eliminar: " + (e.message || ""));
    }
    setWorking(false);
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "90vh",
          background: DS.bgSide, borderRadius: 16, border: DS.border,
          fontFamily: DS.font, color: DS.textPrimary,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: DS.border,
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 800, color: DS.textMuted,
              letterSpacing: "0.18em", textTransform: "uppercase",
              marginBottom: 5,
            }}>
              {sectionLabel(item.section)} · {item.status.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
              {item.title}
            </div>
            <div style={{ fontSize: 11.5, color: DS.textMuted, marginTop: 6 }}>
              <strong style={{ color: DS.textSecondary }}>{item.reporter_name || "Anónimo"}</strong>
              {item.company_name ? ` · ${item.company_name}` : ""}
              {item.reporter_email ? ` · ${item.reporter_email}` : ""}
              {item.reporter_role ? ` · ${item.reporter_role}` : ""}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: DS.textMuted,
              cursor: "pointer", fontSize: 18, padding: 4,
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {item.body && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Detalle</SectionLabel>
              <div style={{
                fontSize: 13, lineHeight: 1.6, color: DS.textPrimary,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>{item.body}</div>
            </div>
          )}

          {item.loom_url && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Loom</SectionLabel>
              <a
                href={item.loom_url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 50,
                  background: "rgba(226,75,74,0.15)",
                  border: "1px solid rgba(226,75,74,0.4)",
                  color: "#E24B4A", textDecoration: "none",
                  fontSize: 12, fontWeight: 700,
                }}
              >🎥 Ver Loom</a>
            </div>
          )}

          {item.images && item.images.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <SectionLabel>Capturas ({item.images.length})</SectionLabel>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8,
              }}>
                {item.images.map((im, i) => (
                  <a key={i} href={im.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      display: "block", borderRadius: 10, overflow: "hidden",
                      border: DS.border, background: "#000",
                    }}
                  >
                    <img src={im.url} alt={im.name || `imagen ${i + 1}`}
                      style={{ width: "100%", height: "auto", display: "block" }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Contexto técnico (collapsable would be nice but inline OK) */}
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>Contexto técnico</SectionLabel>
            <div style={{ fontSize: 11, color: DS.textMuted, lineHeight: 1.6 }}>
              {item.url_path && <div>📍 <code>{item.url_path}</code></div>}
              {item.viewport && <div>📐 Viewport: {item.viewport}</div>}
              {item.user_agent && (
                <div style={{ marginTop: 4, opacity: 0.7,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{item.user_agent}</div>
              )}
            </div>
          </div>

          {/* Admin notes */}
          <div style={{ marginBottom: 8 }}>
            <SectionLabel>Notas internas</SectionLabel>
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Notas para vos / contexto del fix…"
              rows={3}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 10,
                border: DS.border, background: DS.bgCard,
                color: DS.textPrimary, fontSize: 12.5, fontFamily: DS.font,
                resize: "vertical", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px",
          borderTop: DS.border,
          display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
          background: DS.bgCard,
        }}>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key)}
              disabled={working || item.status === s.key}
              style={{
                padding: "7px 13px", borderRadius: 50, border: "none",
                background: item.status === s.key ? `${s.color}30` : s.color,
                color: item.status === s.key ? s.color : "#fff",
                fontSize: 11, fontWeight: 700,
                cursor: working || item.status === s.key ? "default" : "pointer",
                fontFamily: DS.font, opacity: working ? 0.5 : 1,
              }}
            >
              {item.status === s.key ? `✓ ${s.label}` : `→ ${s.label}`}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={remove}
            disabled={working}
            style={{
              padding: "7px 13px", borderRadius: 50,
              border: "1px solid rgba(226,75,74,0.4)",
              background: "transparent", color: "#E24B4A",
              fontSize: 11, fontWeight: 700, cursor: "pointer",
              fontFamily: DS.font,
            }}
          >🗑 Eliminar</button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, color: DS.textMuted,
      letterSpacing: "0.14em", textTransform: "uppercase",
      marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

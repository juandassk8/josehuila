import { useEffect, useMemo, useState, useCallback } from "react";
import { DS } from "../../lib/design.js";
import { listSops } from "../data/sopsDb.js";
import { database } from "../../lib/backend.js";
import { SopModal } from "./SopModal.jsx";
import { WorkspaceCard } from "./WorkspaceCard.jsx";

// Colores por sección (cicla si hay más de 6)
const SECTION_COLORS = [
  DS.blue, DS.purple, DS.amber, DS.green, "#EC4899", "#06B6D4",
];

// Panel auto-contenido: renderiza WorkspaceCard como trigger.
// Al hacer click abre el modal con secciones colapsables.
export function ManualesPanel({ targetMember, currentMember, accent }) {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const ownerId = targetMember?.id;
  const isAdmin = currentMember?.role === "admin";

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await listSops(ownerId);
    setSops(data || []);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!ownerId) return;
    const ch = database
      .channel(`sops_${ownerId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "sops", filter: `owner_id=eq.${ownerId}` },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(ch);
  }, [ownerId, load]);

  const total = sops.length;
  const configured = sops.filter((s) => s.loom_url && s.doc_url).length;
  const partial = sops.filter((s) => (s.loom_url || s.doc_url) && !(s.loom_url && s.doc_url)).length;
  const empty = total - configured - partial;

  const sectionsCount = new Set(sops.map((s) => s.group_title)).size;

  return (
    <>
      <WorkspaceCard
        icon="📘"
        title="Manuales"
        subtitle={sectionsCount > 0 ? `Central Command · ${sectionsCount} secciones` : "Central Command"}
        chips={total === 0 ? [{ label: "Sin configurar", status: "gris" }] : [
          { label: `${configured} listos`,  status: configured > 0 ? "verde" : "gris" },
          { label: `${partial + empty} pendientes`, status: (partial + empty) > 0 ? "naranja" : "gris" },
        ]}
        metric={
          loading ? "Cargando…" :
          total === 0 ? "Sin manuales todavía" :
          `${total} SOP${total === 1 ? "" : "s"} · ${Math.round((configured / total) * 100)}% completos`
        }
        cta={total === 0 && isAdmin ? "Crear primero →" : "Abrir manuales →"}
        onClick={() => setOpen(true)}
        accent={"#EC4899"}
      />

      {open && (
        <ManualesModal
          sops={sops}
          loading={loading}
          targetMember={targetMember}
          isAdmin={isAdmin}
          onClose={() => setOpen(false)}
          onReload={load}
        />
      )}
    </>
  );
}

function ManualesModal({ sops, loading, targetMember, isAdmin, onClose, onReload }) {
  const [editingSop, setEditingSop] = useState(null);
  const [creating, setCreating] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  const grouped = useMemo(() => {
    const groups = {};
    for (const s of sops) {
      if (!groups[s.group_title]) {
        groups[s.group_title] = {
          title: s.group_title,
          subtitle: s.group_subtitle,
          sort: s.group_sort,
          items: [],
        };
      }
      groups[s.group_title].items.push(s);
    }
    return Object.values(groups).sort((a, b) => a.sort - b.sort);
  }, [sops]);

  // Por default, primera sección expandida
  useEffect(() => {
    if (grouped.length > 0 && expandedGroups.size === 0) {
      setExpandedGroups(new Set([grouped[0].title]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped.length]);

  const existingGroups = useMemo(
    () => grouped.map((g) => ({
      group_title: g.title,
      group_subtitle: g.subtitle,
      group_sort: g.sort,
    })),
    [grouped]
  );

  const toggleGroup = (title) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const expandAll = () => setExpandedGroups(new Set(grouped.map((g) => g.title)));
  const collapseAll = () => setExpandedGroups(new Set());

  const handleSaved = () => {
    setEditingSop(null);
    setCreating(false);
    onReload?.();
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          zIndex: 450, padding: "5vh 24px",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: DS.bgSide, border: DS.border, borderRadius: 16,
            width: "min(880px, 100%)", maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            fontFamily: DS.font, overflow: "hidden",
            boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "18px 22px 14px",
            borderBottom: DS.border,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "#EC489918", border: "1px solid #EC489930",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              📘
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, color: DS.textMuted,
                letterSpacing: "0.18em",
              }}>
                CENTRAL COMMAND
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: DS.textPrimary, lineHeight: 1.2 }}>
                Manuales · {targetMember?.name || "Equipo"}
              </div>
            </div>
            {grouped.length > 1 && (
              <div style={{ display: "flex", gap: 4 }}>
                <HeaderMini onClick={expandAll}>Expandir</HeaderMini>
                <HeaderMini onClick={collapseAll}>Contraer</HeaderMini>
              </div>
            )}
            {isAdmin && (
              <button
                onClick={() => setCreating(true)}
                style={{
                  padding: "8px 14px", borderRadius: 50, border: "none",
                  background: DS.textPrimary, color: DS.bg,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  fontFamily: DS.font, whiteSpace: "nowrap",
                }}
              >
                + Nuevo SOP
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: "none",
                color: DS.textMuted, fontSize: 22, lineHeight: 1,
                cursor: "pointer", padding: "2px 6px",
              }}
            >
              ×
            </button>
          </div>

          {/* Body scroll */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 22px" }}>
            {loading ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: DS.textMuted, fontSize: 13 }}>
                Cargando…
              </div>
            ) : grouped.length === 0 ? (
              <div style={{
                padding: "40px 20px", textAlign: "center", color: DS.textMuted,
                fontSize: 13, border: DS.borderDash, borderRadius: 12,
              }}>
                {isAdmin
                  ? "Sin manuales todavía. Click en + Nuevo SOP para crear el primero."
                  : "Aún no hay manuales configurados para este espacio."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {grouped.map((g, idx) => (
                  <Accordion
                    key={g.title}
                    group={g}
                    color={SECTION_COLORS[idx % SECTION_COLORS.length]}
                    expanded={expandedGroups.has(g.title)}
                    onToggle={() => toggleGroup(g.title)}
                    isAdmin={isAdmin}
                    onEditSop={setEditingSop}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {(creating || editingSop) && (
        <SopModal
          sop={editingSop}
          ownerId={targetMember?.id}
          existingGroups={existingGroups}
          onClose={() => { setCreating(false); setEditingSop(null); }}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

function Accordion({ group, color, expanded, onToggle, isAdmin, onEditSop }) {
  const configured = group.items.filter((s) => s.loom_url && s.doc_url).length;
  const total = group.items.length;

  return (
    <div style={{
      background: DS.bgCard, border: `1px solid ${color}25`,
      borderRadius: 12, overflow: "hidden",
    }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", fontFamily: DS.font,
          borderLeft: `3px solid ${color}`,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = color + "08"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{
          width: 20, color, fontSize: 12, fontWeight: 700, flexShrink: 0,
          transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s",
        }}>
          ▸
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: DS.textPrimary,
            lineHeight: 1.3,
          }}>
            {group.title}
          </div>
          {group.subtitle && !expanded && (
            <div style={{
              fontSize: 11, color: DS.textMuted, marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {group.subtitle}
            </div>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 700, color: DS.textMuted,
          padding: "3px 10px", borderRadius: 50,
          background: color + "12", border: `1px solid ${color}30`,
        }}>
          <span style={{ color }}>{configured}</span>
          <span>/</span>
          <span>{total}</span>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "4px 12px 12px" }}>
          {group.subtitle && (
            <div style={{
              fontSize: 12, color: DS.textMuted, fontStyle: "italic",
              padding: "2px 4px 10px", borderBottom: DS.border,
              marginBottom: 8,
            }}>
              {group.subtitle}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {group.items.map((sop) => (
              <SopRow
                key={sop.id}
                sop={sop}
                color={color}
                isAdmin={isAdmin}
                onEdit={() => onEditSop(sop)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SopRow({ sop, color, isAdmin, onEdit }) {
  const [showFocus, setShowFocus] = useState(false);
  const hasLoom = !!(sop.loom_url && sop.loom_url.trim());
  const hasDoc = !!(sop.doc_url && sop.doc_url.trim());

  return (
    <div style={{
      background: DS.bg,
      border: DS.border,
      borderRadius: 10,
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 6,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          flex: 1, minWidth: 0,
          fontSize: 13, fontWeight: 600, color: DS.textPrimary,
          lineHeight: 1.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {sop.title}
        </div>

        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <MiniLink href={sop.loom_url} enabled={hasLoom} color={color} label="Loom" icon="🎥" />
          <MiniLink href={sop.doc_url} enabled={hasDoc} color={color} label="Doc" icon="📄" />
        </div>

        {sop.focus_text && (
          <button
            onClick={() => setShowFocus((v) => !v)}
            title={showFocus ? "Ocultar contexto" : "Ver contexto"}
            style={{
              background: "transparent", border: "none", color: DS.textMuted,
              cursor: "pointer", fontSize: 11, padding: "0 4px",
              flexShrink: 0,
            }}
          >
            {showFocus ? "▴" : "▾"}
          </button>
        )}

        {isAdmin && (
          <button
            onClick={onEdit}
            title="Editar SOP"
            style={{
              background: "transparent", border: "none", color: DS.textMuted,
              cursor: "pointer", fontSize: 13, padding: "0 4px",
              flexShrink: 0,
            }}
          >
            ⋯
          </button>
        )}
      </div>

      {showFocus && sop.focus_text && (
        <div style={{
          fontSize: 11.5, color: DS.textSecondary,
          lineHeight: 1.5, padding: "4px 2px 2px",
          borderTop: DS.border, marginTop: 2,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            color: DS.textMuted, marginRight: 6,
          }}>
            EN QUÉ ENFOCARTE
          </span>
          {sop.focus_text}
        </div>
      )}
    </div>
  );
}

function MiniLink({ href, enabled, color, label, icon }) {
  if (!enabled) {
    return (
      <span
        title={`${label} pendiente de configurar`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 8px", borderRadius: 50,
          background: "transparent", border: `1px dashed ${DS.textHint}`,
          color: DS.textMuted, fontSize: 10, fontWeight: 600,
          fontFamily: DS.font, opacity: 0.6,
          cursor: "not-allowed",
        }}
      >
        <span style={{ fontSize: 9 }}>{icon}</span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Abrir ${label}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "3px 10px", borderRadius: 50,
        background: color + "18", border: `1px solid ${color}55`,
        color, fontSize: 10, fontWeight: 700,
        fontFamily: DS.font, textDecoration: "none",
      }}
    >
      <span style={{ fontSize: 9 }}>{icon}</span>
      <span>{label}</span>
    </a>
  );
}

function HeaderMini({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px", borderRadius: 50,
        background: "transparent", border: `1px solid ${DS.textHint}`,
        color: DS.textSecondary, fontSize: 10, fontWeight: 600,
        cursor: "pointer", fontFamily: DS.font,
      }}
    >
      {children}
    </button>
  );
}

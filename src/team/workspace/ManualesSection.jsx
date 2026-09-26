import { useEffect, useMemo, useState, useCallback } from "react";
import { DS } from "../../lib/design.js";
import { listSops } from "../data/sopsDb.js";
import { database } from "../../lib/backend.js";
import { SopModal } from "./SopModal.jsx";

// Renderiza los SOPs del targetMember agrupados por sección.
// Admin puede crear/editar/eliminar. Miembros solo ven y abren links.
export function ManualesSection({ targetMember, currentMember, accent }) {
  const [sops, setSops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // sop en edición
  const [creating, setCreating] = useState(false);

  const isAdmin = currentMember?.role === "admin";
  const ownerId = targetMember?.id;

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await listSops(ownerId);
    setSops(data || []);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  // Suscripción realtime a cambios en sops de este owner
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

  const existingGroups = useMemo(
    () => grouped.map((g) => ({
      group_title: g.title,
      group_subtitle: g.subtitle,
      group_sort: g.sort,
    })),
    [grouped]
  );

  const handleSaved = () => {
    setEditing(null);
    setCreating(false);
    load();
  };

  if (!ownerId) return null;

  return (
    <div style={{ marginTop: 28, fontFamily: DS.font }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, gap: 10,
      }}>
        <div>
          <div style={{
            fontSize: 9, fontWeight: 700, color: DS.textMuted,
            letterSpacing: "0.18em", marginBottom: 4,
          }}>
            CENTRAL COMMAND
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: DS.textPrimary }}>
            📘 Manuales
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreating(true)}
            style={{
              padding: "7px 14px", borderRadius: 50, border: "none",
              background: DS.textPrimary, color: DS.bg,
              fontSize: 11, fontWeight: 700, fontFamily: DS.font, cursor: "pointer",
            }}
          >
            + Nuevo SOP
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: DS.textMuted, padding: "20px 0" }}>Cargando…</div>
      ) : grouped.length === 0 ? (
        <div style={{
          padding: "28px 16px", border: DS.borderDash, borderRadius: 12,
          color: DS.textMuted, fontSize: 13, textAlign: "center",
        }}>
          {isAdmin
            ? "Sin manuales todavía. Click en + Nuevo SOP para crear el primero."
            : "Aún no hay manuales configurados para este espacio."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {grouped.map((g) => (
            <section key={g.title}>
              <div style={{
                fontSize: 13, fontWeight: 700, color: DS.textPrimary,
                marginBottom: 2,
              }}>
                {g.title}
              </div>
              {g.subtitle && (
                <div style={{
                  fontSize: 12, color: DS.textMuted, marginBottom: 10,
                  fontStyle: "italic",
                }}>
                  {g.subtitle}
                </div>
              )}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 10,
              }}>
                {g.items.map((sop) => (
                  <SopCard
                    key={sop.id}
                    sop={sop}
                    accent={accent}
                    isAdmin={isAdmin}
                    onEdit={() => setEditing(sop)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <SopModal
          sop={editing}
          ownerId={ownerId}
          existingGroups={existingGroups}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

function SopCard({ sop, accent, isAdmin, onEdit }) {
  const hasLoom = sop.loom_url && sop.loom_url.trim();
  const hasDoc = sop.doc_url && sop.doc_url.trim();
  return (
    <div style={{
      background: DS.bgCard, border: DS.border, borderRadius: 12,
      padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 8,
      position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: DS.textPrimary,
          flex: 1, lineHeight: 1.3,
        }}>
          {sop.title}
        </div>
        {isAdmin && (
          <button
            onClick={onEdit}
            title="Editar"
            style={{
              background: "transparent", border: "none", color: DS.textMuted,
              cursor: "pointer", fontSize: 13, padding: "0 4px", lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ⋯
          </button>
        )}
      </div>
      {sop.focus_text && (
        <div style={{
          fontSize: 11.5, color: DS.textSecondary, lineHeight: 1.45,
        }}>
          <strong style={{ color: DS.textMuted, fontWeight: 700, fontSize: 10, letterSpacing: "0.08em" }}>
            EN QUÉ ENFOCARTE
          </strong>
          <br />
          {sop.focus_text}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <LinkBtn
          href={hasLoom ? sop.loom_url : null}
          icon="🎥"
          label="Loom"
          accent={accent}
        />
        <LinkBtn
          href={hasDoc ? sop.doc_url : null}
          icon="📄"
          label="Documento"
          accent={accent}
        />
      </div>
    </div>
  );
}

function LinkBtn({ href, icon, label, accent }) {
  const disabled = !href;
  return (
    <a
      href={href || "#"}
      target={href ? "_blank" : undefined}
      rel={href ? "noopener noreferrer" : undefined}
      onClick={(e) => { if (disabled) e.preventDefault(); }}
      style={{
        padding: "6px 12px", borderRadius: 50,
        background: disabled ? "transparent" : (accent || DS.purple) + "18",
        border: `1px solid ${disabled ? DS.textHint : (accent || DS.purple) + "55"}`,
        color: disabled ? DS.textMuted : (accent || DS.purple),
        fontSize: 11, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: DS.font, textDecoration: "none",
        display: "inline-flex", alignItems: "center", gap: 5,
        opacity: disabled ? 0.55 : 1,
      }}
      title={disabled ? "Pendiente de configurar" : `Abrir ${label}`}
    >
      <span>{icon}</span>
      <span>{disabled ? `${label} · pendiente` : label}</span>
    </a>
  );
}

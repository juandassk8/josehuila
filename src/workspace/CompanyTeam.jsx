import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { useCompanyMask } from "../lib/censor.jsx";
import { ROLES, ROLE_BY_KEY, AVATAR_COLORS } from "./team_roles.js";
import { tareasDelRol } from "../team/pipeline/pipelineConstants.js";
import { buildApiHeaders } from "../lib/apiAuth.js";
import { textoAccesosPendientes } from "./accesos_pendientes.js";
import { mensajeErrorMiembro, limitarNumero } from "./errores_miembro.js";

// Qué tareas automáticas le va a generar el Content Pipeline a esta persona,
// según los roles que tenga marcados. Es la única forma de ver, antes de
// guardar, que un rol de más le va a traer trabajo que no es suyo.
function TareasQueLeLlegan({ roles, T }) {
  const porRol = (roles || [])
    .map((r) => ({ rol: r, tareas: tareasDelRol(r.key) }))
    .filter((x) => x.tareas.length);
  if (!porRol.length) return null;
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: T.border, background: "transparent" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.textMuted, marginBottom: 6 }}>
        Tareas que le van a llegar solas
      </div>
      {porRol.map(({ rol, tareas }) => (
        <div key={rol.key} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 11.5, lineHeight: 1.5 }}>
          <span style={{ color: rol.color, fontWeight: 700, flex: "none" }}>{rol.label}</span>
          <span style={{ color: T.textSecondary }}>{tareas.join(" · ")}</span>
        </div>
      ))}
    </div>
  );
}
import {
  listTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  authUserIdPorCorreo,
} from "./team_db.js";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function CompanyTeam({ companyId, companyName, companySlug, createdVia, isAdmin, puedeDarCredenciales = false, currentMember }) {
  const { isDark } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const displayName = mask.name(companyName, companyId);
  // El link que hay que pasarle a quien entra. Vivía solo en la cabeza de quien
  // repartía las claves: la caja de credenciales daba correo y contraseña, y la
  // persona quedaba con dos datos y ningún lugar donde usarlos.
  const linkPortal = companySlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/cliente/${companySlug}`
    : "";
  const [linkCopiado, setLinkCopiado] = useState(false);

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showRolesAll, setShowRolesAll] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ms = await listTeamMembers(companyId);
        if (!cancelled) setMembers(ms);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Recarga puntual: tras dar acceso, la tarjeta tiene que pasar a decir que la
  // persona ya puede entrar.
  const recargar = async () => {
    if (!companyId) return;
    try { setMembers(await listTeamMembers(companyId)); } catch { /* la lista vieja sirve */ }
  };

  // Cuánta gente ENTRA, que no es lo mismo que cuántas fichas hay: la mitad del
  // equipo suele estar cargado para asignarle tareas, sin cuenta propia. El
  // número que importa —y el que se cobra— es el de los que tienen acceso.
  const conAcceso = useMemo(() => members.filter((m) => m.auth_user_id).length, [members]);

  const avisoAccesos = useMemo(() => textoAccesosPendientes(members), [members]);

  // El precio solo se muestra a quien lo paga. Las empresas que entraron por el
  // panel son clientes de la agencia y no pagan por seat: mostrarles "$49 + $20"
  // sería inventarles una factura.
  const precioSeats = createdVia === "self_signup" && conAcceso > 0
    ? `$${49 + Math.max(0, conAcceso - 1) * 10}/mes`
    : "";

  const membersByRole = useMemo(() => {
    const map = {};
    for (const r of ROLES) map[r.key] = [];
    for (const m of members) {
      for (const role of m.roles || []) {
        if (map[role]) map[role].push(m);
      }
    }
    return map;
  }, [members]);

  const missingRoles = ROLES.filter((r) => (membersByRole[r.key] || []).length === 0);
  const allCovered = missingRoles.length === 0;

  const handleSave = async (payload) => {
    // Ponerle el correo de alguien que ya entra a otra empresa alcanza para que
    // entre a esta: se vincula la ficha con el acceso que ya tiene. Sin esto
    // había que "Rehacer contraseña", que se la cambia en todas partes.
    let datos = payload;
    if (payload.email && !editing?.auth_user_id) {
      const ya = await authUserIdPorCorreo(payload.email);
      if (ya) datos = { ...payload, auth_user_id: ya };
    }
    if (editing?.id) {
      const updated = await updateTeamMember(editing.id, datos);
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } else {
      const avatar_color = datos.avatar_color || AVATAR_COLORS[members.length % AVATAR_COLORS.length];
      const created = await createTeamMember({ ...datos, avatar_color, company_id: companyId, sort_order: members.length });
      setMembers((prev) => [...prev, created]);
    }
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este miembro del equipo?")) return;
    await deleteTeamMember(id);
    setMembers((prev) => prev.filter((m) => m.id !== id));
    setEditing(null);
  };

  // Roles a mostrar: si no hay miembros y todos están descubiertos, mostrar
  // todos. Si todos cubiertos → ocultar (con botón "Ver"). Si hay algunos
  // descubiertos → mostrar solo los descubiertos.
  const rolesToShow = showRolesAll
    ? ROLES
    : (allCovered ? [] : missingRoles);

  return (
    <div style={{
      padding: "40px 48px 80px",
      maxWidth: 1280, margin: "0 auto",
      color: T.textPrimary, fontFamily: T.font,
    }}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Equipo · {displayName}
        </div>
      </div>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginTop: 6, marginBottom: 24, gap: 20, flexWrap: "wrap",
      }}>
        <h1 style={{
          fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em",
          color: T.textPrimary, margin: 0,
        }}>
          Equipo de {displayName}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {currentMember && !isAdmin && (() => {
            const me = members.find((m) => m.id === currentMember.id);
            if (!me) return null;
            return (
              <button
                onClick={() => setEditing(me)}
                style={{
                  padding: "10px 16px", borderRadius: 50,
                  background: "transparent", color: T.textSecondary,
                  border: `1px solid ${T.textHint}`,
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  fontFamily: T.font,
                }}
              >
                ⚙️ Mi cuenta
              </button>
            );
          })()}
          {isAdmin && (
            <button
              data-tour="btn-agregar-rol"
              onClick={() => setEditing({})}
              style={primaryBtn(isDark)}
            >
              + Agregar persona
            </button>
          )}
        </div>
      </div>

      {/* El link y cuánta gente entra: los dos datos que uno necesita cada vez
          que suma a alguien, no solo el rato después de crear una clave. */}
      {linkPortal && puedeDarCredenciales && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          marginTop: 20, padding: "13px 16px", borderRadius: T.radius,
          background: T.bgCard, border: T.border,
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.textMuted, flex: "none" }}>
            Link del portal
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: T.textPrimary, wordBreak: "break-all", flex: "1 1 220px" }}>
            {linkPortal}
          </span>
          <button
            onClick={() => { navigator.clipboard?.writeText(linkPortal); setLinkCopiado(true); }}
            style={{
              flex: "none", padding: "6px 13px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${T.textHint}`, background: "transparent",
              color: T.textPrimary, fontSize: 11.5, fontWeight: 700, fontFamily: "inherit",
            }}>
            {linkCopiado ? "✓ Copiado" : "Copiar"}
          </button>
          <span style={{ flex: "none", fontSize: 12, color: T.textMuted }}>
            {conAcceso === 1 ? "1 persona entra" : `${conAcceso} personas entran`}
            {precioSeats ? ` · ${precioSeats}` : ""}
          </span>
        </div>
      )}

      {/* Quién no puede entrar, dicho una vez y arriba. Solo lo ve quien puede
          hacer algo al respecto; a los demás sería un reproche sin botón. */}
      {!loading && isAdmin && avisoAccesos && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14,
          padding: "11px 14px", borderRadius: T.radius, fontSize: 12.5, lineHeight: 1.55,
          background: "rgba(240,169,59,.12)", border: "1px solid rgba(240,169,59,.35)",
          color: T.textPrimary,
        }}>
          <span style={{ flex: "none", fontSize: 14, lineHeight: 1.2 }}>⚠</span>
          <span>{avisoAccesos}</span>
        </div>
      )}

      {loading ? (
        <div style={{ color: T.textMuted, fontSize: 13, padding: 20 }}>Cargando equipo…</div>
      ) : (
        <>
          {/* Sección 1: Miembros del equipo (arriba ahora) */}
          <SectionHeader T={T}>
            <span>Miembros del equipo ({members.length})</span>
          </SectionHeader>
          {members.length === 0 ? (
            <div style={{
              marginTop: 12, padding: "40px 20px", textAlign: "center",
              background: T.bgCard, border: T.border, borderRadius: T.radius,
              color: T.textMuted, fontSize: 13,
            }}>
              {isAdmin
                ? "Aún no agregaste a nadie. Hacé click en + Agregar persona para empezar."
                : "Todavía no hay miembros en este equipo."}
            </div>
          ) : (
            <div data-tour="colores-rol" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 14, marginTop: 12, marginBottom: 36,
            }}>
              {members.map((m) => {
                const isMyOwnCard = currentMember?.id === m.id;
                const canEditCard = isAdmin || isMyOwnCard;
                return (
                  <MemberCard
                    key={m.id}
                    member={m}
                    onEdit={() => canEditCard && setEditing(m)}
                    isAdmin={canEditCard}
                    isMine={isMyOwnCard}
                    T={T}
                    isDark={isDark}
                  />
                );
              })}
            </div>
          )}

          {/* Sección 2: Roles — solo sin cubrir (abajo ahora) */}
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginTop: 12,
          }}>
            <div style={{
              fontSize: 11, color: T.textSecondary, fontWeight: 700,
              letterSpacing: "0.12em", textTransform: "uppercase",
            }}>
              {allCovered
                ? `Roles esenciales · todos cubiertos ✓`
                : `Roles sin cubrir (${missingRoles.length} de ${ROLES.length})`}
            </div>
            <button
              onClick={() => setShowRolesAll(!showRolesAll)}
              style={{
                background: "transparent", border: "none",
                color: T.textMuted, fontSize: 11, fontWeight: 600,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "inherit",
              }}
            >
              {showRolesAll ? "Mostrar solo sin cubrir" : "Ver los 7 roles"}
            </button>
          </div>

          {!allCovered && !showRolesAll && (
            <div style={{
              marginTop: 12, padding: "12px 16px", borderRadius: 12,
              background: "rgba(245,166,35,0.12)",
              border: "1px solid rgba(245,166,35,0.35)",
              fontSize: 12, color: T.textPrimary, lineHeight: 1.5,
            }}>
              ⚠️ Asigná personas existentes o sumá alguien nuevo al equipo.
            </div>
          )}

          {rolesToShow.length > 0 && (
            <div data-tour="permisos" style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14, marginTop: 12,
            }}>
              {rolesToShow.map((role) => (
                <RoleCard
                  key={role.key}
                  role={role}
                  members={membersByRole[role.key] || []}
                  onClickMember={(m) => isAdmin && setEditing(m)}
                  onAssign={() => isAdmin && setEditing({ prefillRole: role.key })}
                  T={T}
                  isDark={isDark}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <ProfileModal
          member={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing.id && isAdmin ? () => handleDelete(editing.id) : null}
          isOwnProfile={!isAdmin && currentMember?.id === editing.id}
          canEditRoles={isAdmin}
          /* Armar el equipo lo hace quien gestiona; repartir llaves, solo el
             dueño. Ver `puedeRepartirCredenciales` en `lib/permisos.js`. */
          puedeDarAcceso={puedeDarCredenciales}
          linkPortal={linkPortal}
          onAccesoCreado={recargar}
          isDark={isDark}
          T={T}
        />
      )}
    </div>
  );
}

function SectionHeader({ children, T }) {
  return (
    <div style={{
      fontSize: 11, color: T.textSecondary, fontWeight: 700,
      letterSpacing: "0.12em", textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function RoleCard({ role, members, onClickMember, onAssign, T, isDark }) {
  const filled = members.length > 0;
  const accent = role.color;
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: T.bgCard,
      border: filled ? T.border : `1px solid ${accent}55`,
      borderRadius: T.radius,
      padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${accent}${isDark ? "22" : "18"}`,
          color: accent, fontSize: 17,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {role.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
            {role.label}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.35, marginTop: 2 }}>
            {role.tagline}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 22 }}>
        {members.length === 0 ? (
          <button
            onClick={onAssign}
            style={{
              fontSize: 10, fontWeight: 700, color: accent,
              padding: "3px 10px", borderRadius: 50,
              background: `${accent}${isDark ? "18" : "12"}`,
              border: `1px dashed ${accent}88`,
              letterSpacing: "0.05em", cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            + ASIGNAR
          </button>
        ) : (
          members.map((m) => (
            <button
              key={m.id}
              onClick={() => onClickMember?.(m)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "3px 8px 3px 3px", borderRadius: 50,
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                border: "none", cursor: "pointer",
                fontSize: 11, fontFamily: "inherit",
                color: T.textPrimary, fontWeight: 600,
              }}
            >
              <Avatar name={m.name} color={m.avatar_color} size={18} />
              <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.name}
              </span>
              {m.is_owner && <span title="Dueño" style={{ fontSize: 9 }}>👑</span>}
              {m.is_ugc_pool && <span title="UGC pool" style={{ fontSize: 9 }}>📹</span>}
            </button>
          ))
        )}
      </div>

      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "transparent", border: "none",
          color: T.textMuted, fontSize: 10, fontWeight: 600,
          cursor: "pointer", padding: 0,
          textAlign: "left", fontFamily: "inherit",
          textDecoration: "underline",
        }}
      >
        {expanded ? "Ocultar" : "¿Qué hace?"}
      </button>

      {expanded && (
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          fontSize: 11.5, color: T.textSecondary, lineHeight: 1.5,
        }}>
          <div style={{ marginBottom: 8 }}>{role.description}</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {role.skills.map((s, i) => (
              <li key={i} style={{ marginBottom: 3 }}>{s}</li>
            ))}
          </ul>
          {role.importance && (
            <div style={{
              marginTop: 8, padding: "6px 10px", borderRadius: 6,
              background: `${accent}${isDark ? "18" : "12"}`,
              fontWeight: 700, color: accent, fontSize: 10.5,
              letterSpacing: "0.04em",
            }}>
              {role.importance}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member, onEdit, isAdmin, T, isDark }) {
  const roleKeys = member.roles || [];
  return (
    <div
      onClick={onEdit}
      style={{
        background: T.bgCard,
        border: member.is_owner
          ? `1.5px solid #F5A62388`
          : T.border,
        borderRadius: T.radius,
        padding: "16px 18px",
        cursor: isAdmin ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={member.name} color={member.avatar_color} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: T.textPrimary,
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {member.name}
            </span>
            {member.is_owner && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
                padding: "2px 7px", borderRadius: 50,
                background: "rgba(245,166,35,0.18)", color: "#F5A623",
              }}>
                👑 DUEÑO
              </span>
            )}
            {member.is_ugc_pool && (
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
                padding: "2px 7px", borderRadius: 50,
                background: "rgba(226,75,74,0.18)", color: "#E24B4A",
              }}>
                📹 UGC POOL
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
            {roleKeys.length} rol{roleKeys.length !== 1 ? "es" : ""}
            {member.phone ? ` · ${member.phone}` : ""}
          </div>
          {/* Si puede entrar o no era invisible: había que ir a otra pantalla y
              correr una migración en lote para averiguarlo. */}
          {!member.is_ugc_pool && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "2px 8px", borderRadius: 50,
              fontSize: 10.5, fontWeight: 700,
              background: member.auth_user_id ? "rgba(29,185,122,0.14)" : "rgba(0,0,0,0.06)",
              color: member.auth_user_id ? "#17976A" : T.textMuted }}>
              {member.auth_user_id ? "✓ Puede entrar" : "Sin acceso"}
            </div>
          )}
        </div>
      </div>

      {/* Solo los roles que cumple, brillantes */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {roleKeys.map((rk) => {
          const r = ROLE_BY_KEY[rk];
          if (!r) return null;
          return (
            <span
              key={rk}
              style={{
                fontSize: 11, fontWeight: 700,
                padding: "4px 10px", borderRadius: 6,
                background: `${r.color}${isDark ? "20" : "14"}`,
                color: r.color,
                border: `1px solid ${r.color}${isDark ? "55" : "44"}`,
                letterSpacing: "0.02em",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {r.icon} {r.label}
            </span>
          );
        })}
        {roleKeys.length === 0 && (
          <span style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>
            Sin roles asignados
          </span>
        )}
      </div>

      {member.bio && (
        <div style={{
          fontSize: 11.5, color: T.textSecondary, lineHeight: 1.5,
          paddingTop: 8, borderTop: T.border,
        }}>
          {member.bio}
        </div>
      )}
    </div>
  );
}

function ProfileModal({ member, onClose, onSave, onDelete, isDark, T, isOwnProfile = false, canEditRoles = true, puedeDarAcceso = false, linkPortal = "", onAccesoCreado }) {
  const isNew = !member.id;
  const [name, setName] = useState(member.name || "");
  const [isOwner, setIsOwner] = useState(!!member.is_owner);
  const [isUgcPool, setIsUgcPool] = useState(!!member.is_ugc_pool);
  const initialRoles = new Set(member.roles || []);
  if (member.prefillRole) initialRoles.add(member.prefillRole);
  const [roles, setRoles] = useState(initialRoles);
  const [notes, setNotes] = useState(member.notes || "");
  const [bio, setBio] = useState(member.bio || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [birthdayDay, setBirthdayDay] = useState(member.birthday_day || "");
  const [birthdayMonth, setBirthdayMonth] = useState(member.birthday_month || "");
  const [accentColor, setAccentColor] = useState(member.avatar_color || AVATAR_COLORS[0]);
  const [email, setEmail] = useState(member.email || "");
  const [showAddRole, setShowAddRole] = useState(false);
  // Alta de credencial. La contraseña se muestra UNA vez: no se guarda en ningún
  // lado, así que no hay de dónde volver a leerla.
  const [accesoBusy, setAccesoBusy] = useState(false);
  const [credencial, setCredencial] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const yaTieneAcceso = !!member.auth_user_id;

  const darAcceso = async () => {
    setAccesoBusy(true); setError(null);
    try {
      const resp = await fetch("/api/admin-create-client-user", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ action: yaTieneAcceso ? "reset-member" : "grant-member", memberId: member.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "No se pudo crear el acceso");
      setCredencial({ email: data.email, password: data.password });
      onAccesoCreado?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally { setAccesoBusy(false); }
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (isUgcPool) {
      setRoles((s) => { const n = new Set(s); n.add("content"); return n; });
    }
  }, [isUgcPool]);

  const toggleRole = (k) => {
    setRoles((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const save = async () => {
    if (!name.trim()) { setError("Ponle un nombre."); return; }
    setSaving(true); setError(null);
    try {
      await onSave({
        name: name.trim(),
        is_owner: isOwner,
        is_ugc_pool: isUgcPool,
        roles: Array.from(roles),
        notes: notes.trim() || null,
        bio: bio.trim() || null,
        phone: phone.trim() || null,
        birthday_day: birthdayDay ? parseInt(birthdayDay, 10) : null,
        birthday_month: birthdayMonth ? parseInt(birthdayMonth, 10) : null,
        avatar_color: accentColor,
        email: email.trim().toLowerCase() || null,
      });
    } catch (e) {
      setError(mensajeErrorMiembro(e));
      setSaving(false);
    }
  };

  const assignedRoles = ROLES.filter((r) => roles.has(r.key));
  const availableToAdd = ROLES.filter((r) => !roles.has(r.key));

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      onClick={onClose}
      data-modal
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: modalBg, border: divider, borderRadius: 16,
          width: "100%", maxWidth: 520, padding: "24px 28px 22px",
          color: T.textPrimary, position: "relative",
          boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* Close X */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16,
            width: 32, height: 32, borderRadius: 8,
            border: divider, background: "transparent",
            color: T.textSecondary, cursor: "pointer",
            fontSize: 16, fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ×
        </button>

        {/* Header: avatar + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{
            position: "relative",
            padding: 3, borderRadius: "50%",
            border: `2px solid ${accentColor}`,
          }}>
            <Avatar name={name || "?"} color={accentColor} size={60} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: accentColor, letterSpacing: "0.14em", fontWeight: 700, textTransform: "uppercase" }}>
              Perfil
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary, lineHeight: 1.2, marginTop: 2 }}>
              {name || "Nueva persona"}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {assignedRoles.length > 0
                ? `${assignedRoles.length} rol${assignedRoles.length !== 1 ? "es" : ""}`
                : "Sin roles asignados"}
            </div>
          </div>
        </div>

        {/* Nombre */}
        <div data-tour="form-rol">
        <FieldLabel T={T}>Nombre</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isUgcPool ? "Ej: UGCs externos" : "Nombre completo"}
          autoFocus
          style={inputStyle(isDark, T)}
        />

        {/* Roles asignados — solo el admin de la empresa puede modificarlos */}
        {canEditRoles && (
        <>
        <FieldLabel T={T} style={{ marginTop: 16 }}>Roles asignados</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {assignedRoles.length === 0 && (
            <div style={{ fontSize: 11, color: T.textMuted, fontStyle: "italic", padding: "4px 0" }}>
              Aún no asignaste ningún rol.
            </div>
          )}
          {assignedRoles.map((r) => (
            <button
              key={r.key}
              onClick={() => toggleRole(r.key)}
              title={`Quitar ${r.label}`}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8,
                background: `${r.color}${isDark ? "22" : "15"}`,
                color: r.color,
                border: `1.5px solid ${r.color}${isDark ? "66" : "55"}`,
                fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: `0 0 0 2px ${r.color}11, 0 0 12px ${r.color}22`,
              }}
            >
              <span>{r.icon}</span>
              <span>{r.label}</span>
              <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 2 }}>×</span>
            </button>
          ))}
          {availableToAdd.length > 0 && (
            <button
              onClick={() => setShowAddRole(!showAddRole)}
              style={{
                padding: "6px 12px", borderRadius: 8,
                background: "transparent",
                border: `1.5px dashed ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`,
                color: T.textSecondary,
                fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {showAddRole ? "Ocultar" : "+ Agregar rol"}
            </button>
          )}
        </div>

        {/* La consecuencia de marcar un rol, dicha en voz alta. Era invisible: a
            un editor le llegaban tareas de grabación porque tenía "Content" de
            más, y no había dónde darse cuenta. */}
        <TareasQueLeLlegan roles={assignedRoles} T={T} />

        {showAddRole && availableToAdd.length > 0 && (
          <div style={{
            marginTop: 10, padding: 10, borderRadius: 10,
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            border: T.border,
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6,
          }}>
            {availableToAdd.map((r) => (
              <button
                key={r.key}
                onClick={() => { toggleRole(r.key); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 10px", borderRadius: 8,
                  border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
                  background: "transparent",
                  color: T.textPrimary, fontFamily: "inherit",
                  cursor: "pointer", textAlign: "left",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 14 }}>{r.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: r.color }}>{r.label}</div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1, lineHeight: 1.3 }}>{r.tagline}</div>
                  {tareasDelRol(r.key).length > 0 && (
                    <div style={{ fontSize: 10, color: r.color, marginTop: 3, lineHeight: 1.3, fontWeight: 600 }}>
                      Le llegan: {tareasDelRol(r.key).join(" · ")}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Toggles owner / UGC */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Toggle label="👑 Es el dueño" active={isOwner} onClick={() => setIsOwner(!isOwner)} accent="#F5A623" T={T} isDark={isDark} />
          <Toggle label="📹 Pool de UGCs" active={isUgcPool} onClick={() => setIsUgcPool(!isUgcPool)} accent="#E24B4A" T={T} isDark={isDark} />
        </div>
        </>
        )}
        {!canEditRoles && isOwnProfile && (
          <div style={{
            marginTop: 14, padding: "10px 12px", borderRadius: 10,
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
            fontSize: 11, color: T.textMuted, lineHeight: 1.5,
          }}>
            Para cambiar tus roles o permisos, pedile al dueño de la empresa.
          </div>
        )}

        {/* Color de acento */}
        <FieldLabel T={T} style={{ marginTop: 18 }}>Color de acento</FieldLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setAccentColor(c)}
              style={{
                width: 28, height: 28, borderRadius: "50%",
                border: accentColor === c
                  ? `2px solid ${T.textPrimary}`
                  : `2px solid transparent`,
                background: c, cursor: "pointer",
                padding: 0,
                boxShadow: accentColor === c ? `0 0 0 2px ${c}44` : "none",
              }}
            />
          ))}
        </div>

        {/* Cumpleaños */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 16 }}>
          <div>
            <FieldLabel T={T}>Día de cumpleaños</FieldLabel>
            <input
              type="number" min={1} max={31}
              value={birthdayDay}
              onChange={(e) => setBirthdayDay(limitarNumero(e.target.value, 1, 31))}
              placeholder="Día"
              style={inputStyle(isDark, T)}
            />
          </div>
          <div>
            <FieldLabel T={T}>Mes</FieldLabel>
            <select
              value={birthdayMonth}
              onChange={(e) => setBirthdayMonth(limitarNumero(e.target.value, 1, 12))}
              style={inputStyle(isDark, T)}
            >
              <option value="">—</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Teléfono */}
        <FieldLabel T={T} style={{ marginTop: 16 }}>Teléfono</FieldLabel>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+57 ..."
          style={inputStyle(isDark, T)}
        />

        {/* Bio */}
        <FieldLabel T={T} style={{ marginTop: 16 }}>Bio</FieldLabel>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          placeholder="Qué hace en el equipo, en qué está enfocado…"
          style={{ ...inputStyle(isDark, T), resize: "vertical", minHeight: 60 }}
        />

        {/* Acceso al workspace (login de colaborador) */}
        <div style={{ marginTop: 20, paddingTop: 14, borderTop: divider }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: T.textPrimary, marginBottom: 4 }}>
            🔐 Acceso al workspace
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
            Con su correo y una contraseña, esta persona entra por el link del cliente y ve solo las secciones que le permiten sus roles.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel T={T}>Email</FieldLabel>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@empresa.com"
                style={inputStyle(isDark, T)}
              />
            </div>
          </div>

          {/* El texto de arriba prometía "email + contraseña" y no había con qué
              darla: guardar el correo dejaba a la persona sin poder entrar, y la
              única salida era migrar en lote a todos los colaboradores de todas
              las empresas. Ahora se resuelve donde uno está parado. */}
          {/* En una ficha NUEVA no hay a quién darle acceso todavía: `member.id`
              no existe hasta guardar. El botón se mostraba igual, y apretarlo
              mandaba `memberId: undefined` al endpoint, que respondía un error
              feo justo en el momento en que alguien está dando de alta a su
              primer compañero de equipo. Era el "falla" al agregar un miembro.
              Ahora ese caso no ofrece un botón roto: dice qué falta. */}
          {puedeDarAcceso && !member.id && (
            <div style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 10,
              border: T.border, fontSize: 11.5, lineHeight: 1.5, color: T.textSecondary,
            }}>
              Guardá primero la ficha. Después, abriéndola de nuevo, le podés crear el acceso al portal.
            </div>
          )}

          {puedeDarAcceso && member.id && (
            <div style={{ marginTop: 14 }}>
              {!credencial ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={darAcceso}
                    disabled={accesoBusy || !email.trim()}
                    title={!email.trim() ? "Primero ponele un correo" : undefined}
                    style={{
                      padding: "8px 16px", borderRadius: 8, cursor: email.trim() ? "pointer" : "default",
                      border: "none", background: email.trim() ? T.accent || "#2664CC" : T.textHint,
                      color: "#fff", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
                    }}>
                    {accesoBusy ? "Creando…" : yaTieneAcceso ? "Rehacer contraseña" : "Dar acceso"}
                  </button>
                  <span style={{ fontSize: 11, color: T.textMuted }}>
                    {yaTieneAcceso ? "Ya puede entrar. Rehacela solo si la perdió." : "Se genera una vez y se la pasás vos."}
                  </span>
                </div>
              ) : (
                <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${T.textHint}`, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#17976A", marginBottom: 8 }}>
                    LISTO — copiala ahora, no se vuelve a mostrar
                  </div>
                  {/* Con el link adentro: son los tres datos que la persona
                      necesita, y se pegan de una sola vez donde sea que se le
                      manden. Antes salían dos y faltaba el más importante. */}
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.7, color: T.textPrimary, wordBreak: "break-all" }}>
                    {linkPortal && <>{linkPortal}<br /></>}
                    {credencial.email}<br />{credencial.password}
                  </div>
                  <button
                    onClick={() => {
                      const texto = [
                        linkPortal ? `Entrá acá: ${linkPortal}` : "",
                        `Correo: ${credencial.email}`,
                        `Contraseña: ${credencial.password}`,
                      ].filter(Boolean).join("\n");
                      navigator.clipboard?.writeText(texto);
                      setCopiado(true);
                    }}
                    style={{ marginTop: 10, padding: "6px 13px", borderRadius: 8, border: `1px solid ${T.textHint}`, background: "transparent", color: T.textPrimary, fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    {copiado ? "✓ Copiado" : "Copiar link, correo y contraseña"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        </div>{/* /data-tour="form-rol" */}

        {error && <div style={{ color: T.red, fontSize: 12, marginTop: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 22, paddingTop: 16, borderTop: divider }}>
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={saving}
                style={{
                  padding: "9px 16px", borderRadius: 50,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
                  background: "transparent", color: T.red,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "9px 18px", borderRadius: 50,
                border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
                background: "transparent", color: T.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={primaryBtn(isDark)}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, color, size = 32 }) {
  const initials = (name || "?")
    .split(" ")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color || "#3B8BD4",
      color: "#fff", fontSize: Math.round(size * 0.38), fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, letterSpacing: "0.02em",
    }}>
      {initials}
    </div>
  );
}

function Toggle({ label, active, onClick, accent, T, isDark }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 50,
        border: active ? `1.5px solid ${accent}` : (isDark ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(0,0,0,0.1)"),
        background: active ? `${accent}${isDark ? "20" : "12"}` : "transparent",
        color: active ? accent : T.textSecondary,
        fontSize: 11.5, fontWeight: 700,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function FieldLabel({ children, T, style }) {
  return (
    <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, marginBottom: 4, letterSpacing: "0.12em", textTransform: "uppercase", ...style }}>
      {children}
    </div>
  );
}

function inputStyle(isDark, T) {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
    color: T.textPrimary,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}

function primaryBtn(isDark) {
  return {
    padding: "10px 20px", borderRadius: 50, border: "none",
    background: isDark ? "#EBEBEB" : "#1A1D1C",
    color: isDark ? "#06060A" : "#FFFFFF",
    fontSize: 12, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit",
  };
}

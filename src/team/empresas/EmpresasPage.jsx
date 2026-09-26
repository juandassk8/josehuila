import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { Topbar } from "../layout/Topbar.jsx";
import { ClientAccessModal } from "./ClientAccessModal.jsx";
import { CollaboratorMigrationModal } from "./CollaboratorMigrationModal.jsx";
import { OnboardingLinkModal, estadoDelFormulario } from "./OnboardingLinkModal.jsx";
import { database } from "../../lib/backend.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { useCompanies } from "../hooks/useCompanies.js";
import { daysUntil } from "../../lib/dates.js";
import { adminCompanyPath } from "../../lib/urls.js";
import { canManageClientAccess } from "../lib/permissions.js";
import { listAllReports, setCompanyArchived } from "../data/db.js";
import {
  calcMetrics,
  fmtCOPCompact,
  fmtNum,
} from "../../lib/reports/metrics.js";
import { shortDate } from "../../lib/reports/periods.js";
import {
  RANGE_PRESETS,
  selectReportsForRange,
  aggregateReports,
} from "../../lib/reports/ranges.js";
import { logger } from "../../lib/logger.js";

// Listado de empresas. Cada card muestra las ventas agregadas del rango
// seleccionado (Hoy, Ayer, 7 días, Este mes, 30 días, Todo). Click abre
// Inforce Reports (/admin/<slug>) en pestaña nueva. Admin puede archivar
// cada empresa con el icono "📦" de la esquina (visual decluttering); el
// toggle "Ver archivadas (N)" cerca del filtro de rango las desoculta.
export function EmpresasPage({ currentMember }) {
  const isAdmin = currentMember?.role === "admin";
  // Crear el acceso del cliente ya no es exclusivo de admin: es un permiso
  // aparte que se habilita por persona desde Equipo → Accesos.
  const puedeAccesoCliente = canManageClientAccess(currentMember);
  const { companies, lastReportByCompany, reload } = useCompanies();
  const [accessModalCompany, setAccessModalCompany] = useState(null);
  const [collabMigrationOpen, setCollabMigrationOpen] = useState(false);
  const [onboardingCompany, setOnboardingCompany] = useState(null);
  // Formulario de onboarding vivo de cada empresa (company_id → fila). Es el aviso
  // interno: sin el badge nadie se entera de que un cliente terminó.
  const [formsByCompany, setFormsByCompany] = useState({});
  const loadForms = () => {
    database.from("onboarding_forms")
      .select("id, company_id, status, alerta, alerta_motivos, completed_at, created_at")
      .is("revoked_at", null).order("created_at", { ascending: true })
      .then(({ data }) => {
        const map = {};
        for (const f of data || []) map[f.company_id] = f;   // gana el más reciente
        setFormsByCompany(map);
      });
  };
  useEffect(loadForms, []);

  // Cliente nuevo en un clic: crea la empresa y su link, y abre el modal para copiar
  // el mensaje de WhatsApp. El cliente le pone el nombre a su marca al llenarlo.
  const [creandoCliente, setCreandoCliente] = useState(false);
  const nuevoCliente = async () => {
    setCreandoCliente(true);
    try {
      const res = await fetch("/api/onboarding-form", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ action: "nuevo-cliente" }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo crear");
      await reload(); loadForms();
      setOnboardingCompany(json.company);
    } catch (err) { logger.warn("[empresas] nuevo cliente:", err.message); window.alert(`No se pudo generar el link: ${err.message}`); }
    finally { setCreandoCliente(false); }
  };

  // «NUEVO»: marcas cuyo formulario llegó y que esta persona todavía no ha abierto.
  // Se recuerda por navegador; es un aviso, no un dato.
  const [vistas, setVistas] = useState(() => { try { return JSON.parse(localStorage.getItem("empresas:vistas") || "[]"); } catch { return []; } });
  const marcarVista = (id) => setVistas((v) => { if (v.includes(id)) return v; const n = [...v, id]; try { localStorage.setItem("empresas:vistas", JSON.stringify(n)); } catch { /* sin storage */ } return n; });
  const esNueva = (id) => { const f = formsByCompany[id]; return !!f && (f.status === "completo" || f.status === "en_curso") && !vistas.includes(id); };
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [rangeKey, setRangeKey] = useState("7d");
  const [showArchived, setShowArchived] = useState(false);
  const [archiveOverride, setArchiveOverride] = useState({}); // id -> bool optimista

  useEffect(() => {
    let cancelled = false;
    listAllReports().then(({ data }) => {
      if (cancelled) return;
      const rows = (data || []).map((r) => ({
        id: r.id,
        company_id: r.company_id,
        period: r.period,
        createdAt: r.created_at,
        ...r.data,
      }));
      setReports(rows);
      setLoadingReports(false);
    });
    return () => { cancelled = true };
  }, []);

  const preset = RANGE_PRESETS.find((p) => p.key === rangeKey) || RANGE_PRESETS[2];
  const range = useMemo(() => preset.getRange(), [preset]);

  const reportsByCompany = useMemo(() => {
    const map = {};
    for (const r of reports) {
      if (!map[r.company_id]) map[r.company_id] = [];
      map[r.company_id].push(r);
    }
    return map;
  }, [reports]);

  // Aplicamos el override optimista sobre el flag archived del row de DB
  // — así el botón "Archivar" responde al click sin esperar al refetch.
  const isArchived = (c) => {
    const o = archiveOverride[c.id];
    if (o === true || o === false) return o;
    return !!c.archived;
  };

  const allRows = useMemo(() => {
    return companies.map((c) => {
      const companyReports = reportsByCompany[c.id] || [];
      const selected = selectReportsForRange(companyReports, range.from, range.to);
      const { totals, count } = aggregateReports(selected);
      const metrics = calcMetrics(totals);
      const lastDateStr = lastReportByCompany[c.id];
      const daysSinceReport = lastDateStr ? Math.abs(daysUntil(lastDateStr) ?? 0) : null;
      let health = "unknown";
      if (daysSinceReport != null) {
        health = daysSinceReport > 7 ? "red" : daysSinceReport > 3 ? "yellow" : "green";
      }
      return {
        company: c,
        archived: isArchived(c),
        daysSinceReport,
        health,
        sales: totals.conversion,
        spend: totals.spend,
        roas: metrics?.roas ?? null,
        reportsInRange: count,
      };
    });
  }, [companies, reportsByCompany, range.from, range.to, lastReportByCompany, archiveOverride]);

  const activeRows = allRows.filter((r) => !r.archived);
  const archivedRows = allRows.filter((r) => r.archived);
  const archivedCount = archivedRows.length;
  // Cuando el toggle está activo, archivadas se muestran al final con opacidad reducida.
  const rows = showArchived ? [...activeRows, ...archivedRows] : activeRows;

  const handleToggleArchive = async (company, nextArchived) => {
    setArchiveOverride((m) => ({ ...m, [company.id]: nextArchived }));
    try {
      await setCompanyArchived(company.id, nextArchived);
      reload?.();
    } catch (err) {
      logger.error("[EmpresasPage] archive failed:", err);
      setArchiveOverride((m) => {
        const next = { ...m };
        delete next[company.id];
        return next;
      });
    }
  };

  const healthColor = {
    green: DS.green,
    yellow: DS.amber,
    red: DS.red,
    unknown: DS.textMuted,
  };

  // Misma pestaña: es una vista de la zona de equipo (/equipo/onboarding/<id>).
  const irAOnboarding = (company) => {
    window.history.pushState(null, "", `/equipo/onboarding/${encodeURIComponent(company.id)}`);
    window.dispatchEvent(new Event("pathchange"));
  };

  const openCompany = (company) => {
    const slug = company.slug || company.name?.toLowerCase().replace(/\s+/g, "-") || "";
    if (!slug) return;
    window.open(adminCompanyPath(slug), "_blank", "noopener");
  };

  const periodLabel = preset.key === "hoy" || preset.key === "ayer"
    ? shortDate(range.from)
    : `${shortDate(range.from)} – ${shortDate(range.to)}`;

  // Progreso de migración a login real (para poder cerrar la seguridad / Fase C).
  const migStats = useMemo(() => {
    const active = companies.filter((c) => !(archiveOverride[c.id] ?? c.archived));
    const migrated = active.filter((c) => c.owner_user_id).length;
    return { total: active.length, migrated, pending: active.length - migrated };
  }, [companies, archiveOverride]);

  return (
    <div>
      <Topbar title="Empresas" subtitle={`${activeRows.length} clientes activos · ${preset.label}`} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <RangePills value={rangeKey} onChange={setRangeKey} />
        {puedeAccesoCliente && (
          <button
            onClick={nuevoCliente}
            disabled={creandoCliente}
            title="Crea la empresa y su link de onboarding de una. El cliente le pone el nombre a su marca al llenarlo."
            style={{ padding: "8px 16px", borderRadius: 50, border: "none", background: "#5e87f5", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, opacity: creandoCliente ? 0.6 : 1 }}
          >
            {creandoCliente ? "Generando…" : "＋ Link para cliente nuevo"}
          </button>
        )}
        {archivedCount > 0 && (
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              padding: "6px 12px", borderRadius: 50,
              border: showArchived ? `1px solid ${DS.textMuted}` : DS.border,
              background: showArchived ? "rgba(255,255,255,0.04)" : "transparent",
              color: showArchived ? DS.textPrimary : DS.textMuted,
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
            }}
          >
            {showArchived ? "▾" : "▸"} Archivadas ({archivedCount})
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: DS.textMuted, marginBottom: 14 }}>
        {periodLabel}
      </div>

      {isAdmin && migStats.total > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
          padding: "12px 16px", borderRadius: 12, marginBottom: 16,
          background: migStats.pending === 0 ? "rgba(29,185,122,0.10)" : "rgba(245,166,35,0.08)",
          border: `1px solid ${migStats.pending === 0 ? "rgba(29,185,122,0.35)" : "rgba(245,166,35,0.30)"}`,
        }}>
          <span style={{ fontSize: 18 }}>{migStats.pending === 0 ? "🔒" : "🔑"}</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>
              Login real de clientes: {migStats.migrated}/{migStats.total} migrados
            </div>
            <div style={{ fontSize: 11, color: DS.textSecondary, marginTop: 2 }}>
              {migStats.pending === 0
                ? "Todos tus clientes tienen login real 🎉 — ya se puede cerrar la seguridad multi-tenant (Fase C)."
                : `Faltan ${migStats.pending} por migrar. Creá el acceso de cada uno con el 🔓. Cuando estén todos, cerramos la brecha de datos (Fase C).`}
            </div>
          </div>
          <button
            onClick={() => setCollabMigrationOpen(true)}
            style={{
              padding: "7px 14px", borderRadius: 50, border: DS.border, background: "transparent",
              color: DS.textPrimary, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap",
            }}
          >Migrar colaboradores</button>
          {/* Barra de progreso */}
          <div style={{ width: 120, height: 6, borderRadius: 50, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
            <div style={{
              width: `${Math.round((migStats.migrated / migStats.total) * 100)}%`, height: "100%",
              background: migStats.pending === 0 ? DS.green : DS.amber,
            }} />
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {rows.map(({ company, archived, daysSinceReport, health, sales, spend, roas, reportsInRange }) => (
          <button
            key={company.id}
            onClick={() => { marcarVista(company.id); openCompany(company); }}
            style={{
              textAlign: "left",
              background: DS.bgCard,
              border: esNueva(company.id) ? "1px solid rgba(233,188,85,0.65)" : DS.border,
              boxShadow: esNueva(company.id) ? "0 0 0 3px rgba(233,188,85,0.12), 0 0 28px rgba(233,188,85,0.18)" : "none",
              borderRadius: 14,
              padding: 16,
              cursor: "pointer",
              fontFamily: DS.font,
              position: "relative",
              transition: "border-color 0.15s, transform 0.15s, opacity 0.15s",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              opacity: archived ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = DS.textMuted;
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = DS.textHint;
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {isAdmin && (
              <span
                role="button"
                tabIndex={0}
                title={archived ? "Desarchivar" : "Archivar"}
                onClick={(e) => { e.stopPropagation(); handleToggleArchive(company, !archived); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault(); e.stopPropagation();
                    handleToggleArchive(company, !archived);
                  }
                }}
                style={{
                  position: "absolute", top: 6, right: 10,
                  padding: "2px 6px",
                  fontSize: 18, lineHeight: 1, fontWeight: 700,
                  color: DS.textMuted, cursor: "pointer",
                  userSelect: "none", letterSpacing: "0.5px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = DS.textPrimary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = DS.textMuted; }}
              >
                {archived ? "↩" : "⋯"}
              </span>
            )}
            {puedeAccesoCliente && (
              <span
                role="button"
                tabIndex={0}
                title={company.owner_user_id ? "Acceso de cliente creado (login real)" : "Crear acceso de cliente (email + contraseña)"}
                onClick={(e) => { e.stopPropagation(); setAccessModalCompany(company); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setAccessModalCompany(company); } }}
                style={{
                  position: "absolute", top: 7, right: 34,
                  fontSize: 13, lineHeight: 1,
                  color: company.owner_user_id ? DS.green : DS.textMuted,
                  cursor: "pointer", userSelect: "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = company.owner_user_id ? DS.green : DS.textPrimary; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = company.owner_user_id ? DS.green : DS.textMuted; }}
              >
                {company.owner_user_id ? "🔑" : "🔓"}
              </span>
            )}
            {puedeAccesoCliente && (
              <span
                role="button"
                tabIndex={0}
                title="Formulario de onboarding: generar el link del cliente y ver cómo va"
                onClick={(e) => { e.stopPropagation(); marcarVista(company.id); setOnboardingCompany(company); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); marcarVista(company.id); setOnboardingCompany(company); } }}
                style={{
                  position: "absolute", top: 7, right: 58,
                  fontSize: 13, lineHeight: 1, cursor: "pointer", userSelect: "none",
                  opacity: formsByCompany[company.id] ? 1 : 0.55,
                }}
              >
                📝
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              title="Onboarding: calificar el Estándar de esta marca (José, Nath y Deison)"
              onClick={(e) => { e.stopPropagation(); irAOnboarding(company); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); irAOnboarding(company); } }}
              style={{ position: "absolute", top: 7, right: puedeAccesoCliente ? 82 : 34, fontSize: 13, lineHeight: 1, cursor: "pointer", userSelect: "none" }}
            >
              🧭
            </span>
            {archived && (
              <span style={{
                position: "absolute", top: 8, left: 8,
                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                padding: "2px 8px", borderRadius: 50,
                background: "rgba(255,255,255,0.05)", color: DS.textMuted,
              }}>
                ARCHIVADA
              </span>
            )}
            {/* Header: avatar + name + health dot */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${DS.red}44, ${DS.red}22)`,
                  color: DS.red,
                  fontSize: 16,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {company.name?.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    color: DS.textPrimary,
                    fontSize: 14,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {company.name}
                </div>
                <div style={{ fontSize: 10, color: DS.textMuted }}>
                  {daysSinceReport != null
                    ? `Último reporte · hace ${daysSinceReport} día${daysSinceReport === 1 ? "" : "s"}`
                    : "Sin reportes"}
                </div>
                {esNueva(company.id) && (
                  <span style={{ display: "inline-block", marginTop: 5, marginRight: 6, padding: "2px 8px", borderRadius: 50, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em", color: "#241a05", background: "linear-gradient(135deg,#f6dc9a,#e9bc55)" }}>NUEVO</span>
                )}
                <OnboardingBadge form={formsByCompany[company.id]} />
              </div>
              <div
                title={
                  health === "green" ? "Al día" :
                  health === "yellow" ? "Revisar pronto" :
                  health === "red" ? "Atrasado" : "Sin datos"
                }
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: healthColor[health],
                  boxShadow: `0 0 10px ${healthColor[health]}`,
                  flexShrink: 0,
                }}
              />
            </div>

            {/* Bloque de ventas del rango */}
            {loadingReports ? (
              <div style={{ fontSize: 11, color: DS.textMuted, fontFamily: "monospace" }}>
                Cargando…
              </div>
            ) : reportsInRange === 0 ? (
              <div style={{
                fontSize: 11, color: DS.textMuted,
                padding: "8px 10px", borderRadius: 8,
                background: "rgba(255,255,255,0.02)",
                border: DS.borderDash,
              }}>
                Sin reportes en este rango
              </div>
            ) : (
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
              }}>
                <Metric label="Ventas" value={fmtCOPCompact(sales)} accent={DS.green} />
                <Metric
                  label="ROAS"
                  value={roas != null ? `${fmtNum(roas, 2)}×` : "—"}
                  accent={roas == null ? DS.textMuted : roas >= 4 ? DS.green : DS.amber}
                />
                <Metric label="Inversión" value={fmtCOPCompact(spend)} accent={DS.textPrimary} />
                <Metric
                  label="Reportes"
                  value={String(reportsInRange)}
                  accent={DS.textPrimary}
                />
              </div>
            )}
          </button>
        ))}
      </div>
      {companies.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            color: DS.textMuted,
            fontSize: 12,
            border: DS.borderDash,
            borderRadius: 14,
          }}
        >
          No hay empresas registradas todavía.
        </div>
      )}

      {accessModalCompany && (
        <ClientAccessModal
          company={accessModalCompany}
          onClose={() => setAccessModalCompany(null)}
          onDone={() => reload()}
        />
      )}
      {onboardingCompany && (
        <OnboardingLinkModal
          company={onboardingCompany}
          onClose={() => setOnboardingCompany(null)}
          onDone={() => { loadForms(); reload(); }}
        />
      )}
      {collabMigrationOpen && (
        <CollaboratorMigrationModal
          onClose={() => setCollabMigrationOpen(false)}
          onDone={() => reload()}
        />
      )}
    </div>
  );
}

// "Formulario completo" con la fecha; rojo si el CPA quedó por encima del máximo
// o si marcó tres o más "no lo sé".
function OnboardingBadge({ form }) {
  const estado = estadoDelFormulario(form);
  if (!estado) return null;
  const fecha = form.completed_at ? new Date(form.completed_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "";
  const cfg = {
    alerta: { color: DS.red, bg: "rgba(226,75,74,0.12)", text: `Formulario completo · ${fecha} · revisar` },
    completo: { color: DS.green, bg: "rgba(52,192,138,0.12)", text: `Formulario completo · ${fecha}` },
    en_curso: { color: DS.amber, bg: "rgba(240,169,59,0.12)", text: "Formulario a medias" },
    pendiente: { color: DS.textMuted, bg: "rgba(255,255,255,0.05)", text: "Formulario enviado" },
    dropshipping: { color: DS.textMuted, bg: "rgba(255,255,255,0.05)", text: "Formulario · dropshipping" },
  }[estado];
  return (
    <span style={{
      display: "inline-block", marginTop: 5, padding: "2px 8px", borderRadius: 50,
      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.02em", color: cfg.color, background: cfg.bg,
    }}>
      {cfg.text}
    </span>
  );
}

function RangePills({ value, onChange }) {
  return (
    <div style={{
      display: "flex",
      gap: 4,
      background: DS.bgCard,
      border: DS.border,
      borderRadius: 50,
      padding: 3,
      width: "fit-content",
      marginBottom: 8,
    }}>
      {RANGE_PRESETS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 50,
              border: "none",
              background: active ? DS.blue : "transparent",
              color: active ? "#fff" : DS.textSecondary,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: DS.font,
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function Metric({ label, value, accent }) {
  return (
    <div style={{
      padding: "8px 10px",
      borderRadius: 8,
      background: "rgba(255,255,255,0.02)",
      border: DS.border,
    }}>
      <div style={{ fontSize: 9, color: DS.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent, fontFamily: "monospace" }}>
        {value}
      </div>
    </div>
  );
}

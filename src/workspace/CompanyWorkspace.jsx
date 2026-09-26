import { useEffect, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { allowedNavForMember } from "./member_access.js";
import { useCompanyMask, CensorButton } from "../lib/censor.jsx";
import { onTutorialHighlight, openTutorials } from "../onboarding/sidebar_highlight.js";
import { useIsMobile } from "../lib/useIsMobile.js";
import { TareasSpacesSection } from "./tasks/TareasSpacesSection.jsx";
import { TareasDataProvider } from "./tasks/TareasDataContext.jsx";

const TUTORIAL_GLOW_KEYFRAMES_ID = "company-workspace-tutorial-glow";
function injectTutorialGlowStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(TUTORIAL_GLOW_KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = TUTORIAL_GLOW_KEYFRAMES_ID;
  style.textContent = `
    @keyframes cw-tutorial-pulse {
      0%, 100% {
        box-shadow:
          0 0 0 0 rgba(88,166,255,1),
          0 0 32px rgba(88,166,255,0.85),
          inset 0 0 14px rgba(88,166,255,0.35);
      }
      50% {
        box-shadow:
          0 0 0 12px rgba(88,166,255,0),
          0 0 56px rgba(95,222,240,0.95),
          inset 0 0 22px rgba(95,222,240,0.45);
      }
    }
  `;
  document.head.appendChild(style);
}

// Workspace cliente — shell rediseñado (portado de "Cliente — Resumen" de Claude Design).
// Sidebar: marca (empresa + Portal Inforce + rayo neón) · buscador ⌘K · nav en grupos
// (Resumen · Creativos · Operación) filtrado por rol · Empresas · pie con usuario.
// El <main> lleva el fondo ambiental. Tokens vía var(--...) → doble tema sin re-render.

// Iconos SVG de trazo (cero emoji).
const IC = {
  home: "M3 12h4l2-7 4 14 2-7h6",
  reportes: "M3 20h18M7 20v-6M12 20v-11M17 20v-4",
  despliegue: "M3 5h18l-7 8v6l-4-2v-4L3 5z",
  pipeline: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  control: "M3 4h18v16H3zM3 9h18M9 4v16",
  adlibrary: "M4 6h16v14H4zM7 9h10M7 13h10M7 17h6",
  plan: "M9 4h6v3H9zM7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1",
  tareas: "M9 11l3 3 8-8M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  equipo: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  papelera: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  sun: "M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.3 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z",
  exit: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  play: "M8 5v14l11-7z",
  chevron: "M9 5l7 7-7 7",
  back: "M15 18l-6-6 6-6",
};

const NAV_GROUPS = [
  { label: "Resumen", items: [
    { key: "home", label: "Resumen", icon: IC.home },
    { key: "reportes", label: "Reportes", icon: IC.reportes },
  ] },
  { label: "Creativos", items: [
    { key: "despliegue", label: "Despliegue", icon: IC.despliegue },
    { key: "pipeline", label: "Content Pipeline", icon: IC.pipeline },
    { key: "adlibrary", label: "Bibliotecas de anuncios", icon: IC.adlibrary },
    // "Control Creativos" oculto del portal del cliente a pedido de José (la
    // feature/código sigue existiendo; solo se saca del nav). 2026-07-27.
  ] },
  { label: "Operación", items: [
    { key: "plan", label: "Plan de implementación", icon: IC.plan },
    { key: "tareas", label: "Tareas", icon: IC.tareas },
    { key: "equipo", label: "Equipo", icon: IC.equipo },
    { key: "papelera", label: "Papelera", icon: IC.papelera },
  ] },
];

const ONBOARDING_KEY = "__onboarding_equipo";

const Icon = ({ d, size = 16, sw = 1.7, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, ...style }}>
    <path d={d} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function CompanyWorkspace({
  companyName,
  companyId,
  currentSection,
  onSectionChange,
  onBack,
  otherCompanies,       // [{ id, name, slug }] — admin only
  onSelectCompany,      // (company) => void
  isAdmin = false,
  currentMember = null, // si está, el usuario es colaborador con restricciones
  onLogout,             // callback de logout para colaboradores
  children,
}) {
  const { isDark, toggleTheme } = useTheme();
  const T = DS;
  const mask = useCompanyMask();
  const [tutorialHighlightKey, setTutorialHighlightKey] = useState(null);

  useEffect(() => {
    injectTutorialGlowStyles();
    return onTutorialHighlight((key) => setTutorialHighlightKey(key));
  }, []);

  // Filtrar nav según el rol del colaborador (si aplica).
  const allowedKeys = currentMember ? allowedNavForMember(currentMember) : null;
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => !allowedKeys || allowedKeys.includes(it.key)) }))
    // Onboarding: SOLO para el equipo Inforce (cuando entra a la empresa desde el
    // panel). El cliente nunca ve este ítem. Abre la pantalla donde José, Nath y
    // Deison califican el Estándar de esta marca (/equipo/onboarding/<id>).
    .map((g) => (isAdmin && g.label === "Operación" ? { ...g, items: [{ key: ONBOARDING_KEY, label: "Onboarding", icon: IC.bolt }, ...g.items] } : g))
    .filter((g) => g.items.length > 0);

  const displayName = mask.name(companyName, companyId);
  const displayInitial = mask.initial(companyName, companyId);

  const activeCompaniesList = (otherCompanies || []).filter((c) => !c.archived || c.id === companyId);
  const archivedCompaniesList = (otherCompanies || []).filter((c) => c.archived && c.id !== companyId);
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  const isMobile = useIsMobile(768);

  // En el teléfono el menú arranca cerrado y NO se recuerda la preferencia: 244px
  // fijos sobre una pantalla de 390 dejan 146px de contenido, así que "abierto"
  // nunca es el estado en el que uno quiere encontrar la pantalla. En desktop
  // sigue mandando lo que la persona eligió la última vez.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.innerWidth <= 768) return true;
      return localStorage.getItem("workspace_sidebar_collapsed") === "1";
    } catch { return false; }
  });

  // Pasar a pantalla chica lo cierra. Al revés no: volver a desktop no tiene por
  // qué abrirle el menú a quien lo había cerrado a propósito.
  useEffect(() => { if (isMobile) setSidebarCollapsed(true); }, [isMobile]);
  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("workspace_sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const showCompanies = (isAdmin && otherCompanies && otherCompanies.length > 0) ||
    (!isAdmin && otherCompanies && otherCompanies.length > 1);
  const roleLabel = currentMember?.is_owner ? "Dueño/a" : "Colaborador";

  // El provider vive acá y no en la rama de Tareas de App.jsx: los espacios de la
  // empresa se ven desde cualquier sección, y quien los abre desde Resumen o
  // Despliegue cae en Tareas con ese espacio ya activo.
  return (
    <TareasDataProvider companyId={companyId}>
    <div style={{
      background: "var(--bg)",
      minHeight: "100vh",
      color: "var(--ink)",
      fontFamily: T.font,
      display: "flex",
      alignItems: "flex-start",
    }}>
      {/* Floating reopen — visible solo cuando el sidebar está collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebarCollapsed}
          title="Mostrar menú"
          style={{
            position: "fixed", top: 16, left: 12, zIndex: 50,
            width: 34, height: 34, borderRadius: 10,
            background: "var(--surface)", border: "1px solid var(--line)",
            color: "var(--ink-2)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "var(--shadow)",
          }}
        ><Icon d="M4 6h16M4 12h16M4 18h16" sw={1.9} /></button>
      )}

      {/* Fondo para cerrar tocando afuera. Solo en celular, donde el menú tapa
          el contenido: en desktop convive con él y no hay nada que cerrar. */}
      {isMobile && !sidebarCollapsed && (
        <div
          onClick={toggleSidebarCollapsed}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(8,8,14,.5)" }}
        />
      )}

      <aside style={{
        width: sidebarCollapsed ? 0 : 244,
        flexShrink: 0,
        minHeight: "100vh",
        // En celular el menú FLOTA encima. Empujando, 244px sobre una pantalla de
        // 390 dejaban 146px: las tablas y el pipeline quedaban ilegibles con el
        // menú abierto, y cerrarlo era un botón que había que descubrir.
        position: isMobile ? "fixed" : "sticky",
        zIndex: isMobile ? 45 : "auto",
        top: 0,
        alignSelf: "flex-start",
        background: "var(--surface-solid)",
        borderRight: sidebarCollapsed ? "none" : "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        fontFamily: T.font,
        overflow: "hidden",
        transition: "width 200ms ease",
      }}>
        {/* Halo neón de fondo */}
        <div style={{ position: "absolute", inset: 0, background: "var(--glow)", pointerEvents: "none" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {/* Marca + tema + colapsar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "22px 18px 16px" }}>
            <div style={{
              width: 34, height: 34, borderRadius: 11, flexShrink: 0,
              background: "rgba(88,166,255,0.14)", display: "grid", placeItems: "center",
              boxShadow: "0 0 0 1px rgba(95,222,240,0.30), 0 0 24px rgba(88,166,255,0.34)",
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 7px rgba(95,222,240,0.85))" }}>
                <path d={IC.bolt} fill="var(--neon)" />
              </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.015em", color: "var(--ink)", lineHeight: 1.1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                textShadow: "0 0 18px rgba(95,222,240,0.40)",
              }}>{displayName || "—"}</div>
              <div style={{ fontSize: 11.5, color: "var(--neon)", lineHeight: 1.1, textShadow: "0 0 14px rgba(95,222,240,0.5)" }}>Portal Inforce</div>
            </div>
            <button
              onClick={toggleTheme}
              title={isDark ? "Modo claro" : "Modo oscuro"}
              style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            ><Icon d={isDark ? IC.sun : IC.moon} size={15} sw={1.8} /></button>
            <button
              onClick={toggleSidebarCollapsed}
              title="Ocultar menú"
              style={{ width: 32, height: 32, borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-3)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            ><Icon d={IC.back} size={15} sw={2} /></button>
          </div>

          {/* Buscador (⌘K) */}
          <div style={{ padding: "0 14px 16px" }}>
            <div style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 12, border: "1px solid var(--line)",
              background: "var(--surface)", color: "var(--ink-3)", fontSize: 13,
            }}>
              <Icon d={IC.search} size={14} sw={2} />
              <span style={{ flex: 1 }}>Buscar</span>
              <kbd style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "var(--ink-4)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 5px" }}>⌘K</kbd>
            </div>
          </div>

          {/* Nav en grupos */}
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, padding: "0 10px 14px", display: "flex", flexDirection: "column", gap: 18 }}>
            {groups.map((g) => (
              <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", padding: "5px 12px 7px" }}>{g.label}</div>
                {g.items.map((it) => {
                  const highlighted = Array.isArray(tutorialHighlightKey)
                    ? tutorialHighlightKey.includes(it.key)
                    : tutorialHighlightKey === it.key;
                  return (
                    <NavItem
                      key={it.key}
                      active={currentSection === it.key}
                      tutorialHighlight={highlighted}
                      /* En celular, elegir sección cierra el menú. Si no, el
                         contenido queda debajo del panel y parece que no pasó
                         nada. */
                      onClick={() => {
                        // No es una sección del portal del cliente: es la pantalla del equipo.
                        if (it.key === ONBOARDING_KEY) { window.location.assign(`/equipo/onboarding/${encodeURIComponent(companyId)}`); return; }
                        onSectionChange?.(it.key); if (isMobile) setSidebarCollapsed(true);
                      }}
                      icon={it.icon}
                      label={it.label}
                    />
                  );
                })}
              </div>
            ))}

            {/* Espacios — visibles en toda la empresa. Elegir uno desde otra
                sección lleva a Tareas con ese espacio activo. */}
            <TareasSpacesSection onPick={() => { if (currentSection !== "tareas") onSectionChange?.("tareas"); }} />

            {/* Empresas — switcher admin / multi-empresa */}
            {showCompanies && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-4)", padding: "5px 12px 7px" }}>Empresas</div>
                {activeCompaniesList.map((co) => (
                  <CompanyRow key={co.id} co={co} active={co.id === companyId} mask={mask} onClick={() => onSelectCompany?.(co)} />
                ))}
                {archivedCompaniesList.length > 0 && (
                  <>
                    <button
                      onClick={() => setArchivedExpanded((v) => !v)}
                      style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", marginTop: 2, borderRadius: 8, border: "none", background: "transparent", color: "var(--ink-4)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", fontFamily: T.font, textAlign: "left" }}
                    >
                      <span style={{ display: "flex", transform: archivedExpanded ? "none" : "rotate(-90deg)", transition: "transform 0.15s" }}><Icon d={IC.chevron} size={11} sw={2.2} /></span>
                      <span>Archivadas ({archivedCompaniesList.length})</span>
                    </button>
                    {archivedExpanded && archivedCompaniesList.map((co) => (
                      <CompanyRow key={co.id} co={co} active={false} faded mask={mask} onClick={() => onSelectCompany?.(co)} />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Acciones secundarias */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
              <div style={{ padding: "0 2px" }}>
                <CensorButton size="sm" style={{ width: "100%", justifyContent: "center" }} />
              </div>
              <button
                onClick={() => openTutorials()}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderRadius: 12, background: `${T.neon}12`, border: `1px solid ${T.neon}33`, color: "var(--ink-2)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: T.font, textAlign: "left" }}
              >
                <span style={{ color: "var(--neon)", display: "flex" }}><Icon d={IC.play} size={15} sw={1.8} /></span>
                <span style={{ flex: 1 }}>Ver tutoriales</span>
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 13px", borderRadius: 12, background: "transparent", border: "1px solid var(--line)", color: "var(--ink-2)", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: T.font, textAlign: "left" }}
                >
                  <Icon d={IC.back} size={14} sw={2} />
                  <span style={{ flex: 1 }}>Panel general</span>
                </button>
              )}
            </div>
          </nav>

          {/* Pie: tarjeta de usuario (colaborador) con ajustes + salir */}
          {currentMember && (
            <div style={{ borderTop: "1px solid var(--line)", padding: "13px 16px", display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: currentMember.avatar_color || "var(--purple)", color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                {(currentMember.name || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentMember.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{roleLabel}</div>
              </div>
              {onLogout && (
                <button onClick={onLogout} title="Cerrar sesión" style={{ width: 30, height: 30, borderRadius: 9, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <Icon d={IC.exit} size={16} sw={1.8} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      <main style={{
        flex: 1,
        minWidth: 0,
        maxWidth: "100%",
        position: "relative",
        minHeight: "100vh",
        backgroundColor: "var(--bg)",
        backgroundImage: "var(--ambient)",
        backgroundAttachment: "local",
        backgroundRepeat: "no-repeat",
      }}>
        {!isDark && (
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "url(/noise.svg)", backgroundRepeat: "repeat", backgroundSize: "300px 300px" }} />
        )}
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
          {children}
        </div>
      </main>
    </div>
    </TareasDataProvider>
  );
}

function CompanyRow({ co, active, faded, mask, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 11, border: "none",
        background: active ? "var(--sel-soft)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-2)",
        cursor: "pointer", fontSize: 13, fontFamily: "inherit", textAlign: "left",
        fontWeight: active ? 600 : 500, opacity: faded ? 0.55 : 1,
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--hover)"; e.currentTarget.style.color = "var(--ink)"; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-2)"; } }}
    >
      <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(88,166,255,0.16)", color: "var(--sel)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
        {mask.initial(co.name, co.id || co.slug)}
      </div>
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {mask.name(co.name, co.id || co.slug)}
      </span>
    </button>
  );
}

function NavItem({ active, tutorialHighlight, onClick, icon, label }) {
  const base = {
    width: "100%", display: "flex", alignItems: "center", gap: 12,
    padding: "9px 12px", borderRadius: 11,
    fontSize: 13.5, fontFamily: DS.font, textAlign: "left", cursor: "pointer",
    border: "1px solid transparent",
    background: active ? "var(--sel-soft)" : "transparent",
    color: active ? "var(--ink)" : "var(--ink-2)",
    fontWeight: active ? 600 : 500,
    transition: "background 0.15s, color 0.15s",
  };
  const hi = tutorialHighlight ? {
    border: "2px solid rgba(88,166,255,1)",
    background: "linear-gradient(135deg, rgba(88,166,255,0.5), rgba(95,222,240,0.28))",
    color: "#fff", fontWeight: 800,
    zIndex: 100001, pointerEvents: "none",
    animation: "cw-tutorial-pulse 1.6s ease-in-out infinite",
  } : null;
  return (
    <button
      onClick={onClick}
      style={{ ...base, ...(hi || {}) }}
      onMouseEnter={(e) => { if (!active && !tutorialHighlight) { e.currentTarget.style.background = "var(--hover)"; e.currentTarget.style.color = "var(--ink)"; } }}
      onMouseLeave={(e) => { if (!active && !tutorialHighlight) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-2)"; } }}
    >
      <Icon d={icon} size={16} sw={1.7} />
      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  );
}

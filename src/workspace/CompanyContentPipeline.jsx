import { lazy, Suspense, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { ContentPipeline } from "../despliegue/ContentPipeline.jsx";
import { PipelineCalendar } from "./pipeline/PipelineCalendar.jsx";
// CompanyGuiones arrastra ProductInfoPanel + ScriptGenerator + xlsx + parsers
// — pesado. Solo se monta cuando el user clickea el tab "Guiones", así que
// tiene sentido cargarlo bajo demanda.
const CompanyGuiones = lazy(() =>
  import("./CompanyGuiones.jsx").then((m) => ({ default: m.CompanyGuiones }))
);

// Wrapper del Content Pipeline con tabs Board / Calendar / Guiones.
// - Board: el kanban existente de slots de despliegue.
// - Calendar: vista mensual con filtros Videos / Estáticos (reemplaza la antigua Agenda).
// - Guiones: módulo de guionista portado de Inforce Central, scoped por empresa.

const TABS = [
  { key: "board",    label: "📋 Board" },
  { key: "calendar", label: "🗓 Calendar" },
  { key: "guiones",  label: "✍️ Guiones" },
];

export function CompanyContentPipeline({ companyId, companyName, isAdmin, currentMember, onNavigate }) {
  const { isDark } = useTheme();
  const T = DS;
  const [tab, setTab] = useState("board");

  // El Guionista es full-edit para owner/PM/copywriter; los demás roles
  // (content/editor/designer/trafficker) lo ven en readOnly: solo Ideas + Generar.
  // Si Jose entra como admin (isAdmin=true), acceso total.
  const guionesAdmin = isAdmin
    || currentMember?.is_owner
    || (currentMember?.roles || []).some(
        (r) => r === "project_manager" || r === "copywriter",
      );

  // Pipeline type — todo usuario (admin Inforce + cualquier miembro del
  // cliente) tiene el toggle visible y arranca en "ads" por default. Antes
  // los miembros NO dueños quedaban forzados a "organic" y veían vacío si
  // todo el contenido vivía en el board "ads". (Fix 2026-05-22.)
  const [pipelineType, setPipelineType] = useState("ads");
  const forcePipelineType = false;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font }}>
      {/* Tab toggle fijo arriba */}
      <div style={{
        padding: "14px 28px 0",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          display: "flex", gap: 3, padding: 3,
          background: isDark ? "rgba(255,255,255,0.04)" : "rgba(55,53,47,0.04)",
          border: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(55,53,47,0.05)",
          borderRadius: 50,
        }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 16px", borderRadius: 50, border: "none",
                background: tab === t.key
                  ? (isDark ? "rgba(255,255,255,0.09)" : "#FFFFFF")
                  : "transparent",
                color: tab === t.key ? T.textPrimary : T.textMuted,
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: tab === t.key
                  ? (isDark ? "0 1px 2px rgba(0,0,0,0.4)" : "0 1px 2px rgba(15,15,15,0.06)")
                  : "none",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body según tab */}
      {tab === "board" && (
        <ContentPipeline
          companyId={companyId}
          companyName={companyName}
          isAdmin={isAdmin}
          currentMember={currentMember}
          simpleMode
          pipelineType={pipelineType}
          forcePipelineType={forcePipelineType}
        />
      )}
      {tab === "calendar" && (
        <PipelineCalendar
          companyId={companyId}
          companyName={companyName}
          isAdmin={isAdmin}
          currentMember={currentMember}
          pipelineType={pipelineType}
        />
      )}
      {tab === "guiones" && (
        <Suspense fallback={
          <div style={{
            padding: 60, textAlign: "center",
            color: T.textMuted, fontSize: 13, letterSpacing: "0.08em",
          }}>
            Cargando guionista…
          </div>
        }>
          <CompanyGuiones
            companyId={companyId}
            companyName={companyName}
            isAdmin={guionesAdmin}
            currentMember={currentMember}
            onNavigate={onNavigate}
            pipelineType={pipelineType}
          />
        </Suspense>
      )}
    </div>
  );
}

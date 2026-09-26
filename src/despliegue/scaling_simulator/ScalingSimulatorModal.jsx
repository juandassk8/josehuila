// Modal principal del Simulador de Escala. Orquesta:
//   - Sliders de Estado del cliente (current/target budget, CPA, AOV)
//   - Sliders de Estrategia (tests/sem, multiplier, win rate, capacidad, max growth)
//   - Planificador inverso (target revenue/sem + plazo → 3 escenarios)
//   - Tabla de proyección con dots de cap activo + deltas
//   - Vista ejecutiva (3 cards)
//   - Save / Load de escenarios

import { useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { useTheme } from "../../lib/theme.jsx";
import { simulate, summarize } from "./simulate.js";
import { plan } from "./plan.js";
import { createScenario, updateScenario } from "./db.js";
import { ProjectionTable } from "./ProjectionTable.jsx";
import { ScenarioPlannerSection } from "./ScenarioPlannerSection.jsx";
import { ExecutiveSummary } from "./ExecutiveSummary.jsx";
import { SaveScenarioDialog } from "./SaveScenarioDialog.jsx";
import { ScenariosListDialog } from "./ScenariosListDialog.jsx";

// Defaults razonables si no hay nada cargado
const DEFAULTS = {
  currentBudget: 4_500_000,
  targetBudget: 9_000_000,
  cpa: 166_000,
  aov: 997_000,
  testsPerWeek: 12,
  testBudgetMultiplier: 1.5,
  winRate: 0.20,
  capacityPerWinner: 500_000,
  maxGrowthRate: 0.25,
  targetMonthlyRevenue: 200_000_000,
  targetWeeks: 4,
};

export function ScalingSimulatorModal({ board, companyId, onClose }) {
  const { isDark } = useTheme();
  const T = DS;

  // Pre-llenado desde board.config si existe
  const initial = useMemo(() => {
    const cfg = board?.config || {};
    return {
      currentBudget: Number(cfg.weekly_spend) || DEFAULTS.currentBudget,
      targetBudget: Number(cfg.weekly_spend) ? Number(cfg.weekly_spend) * 2 : DEFAULTS.targetBudget,
      cpa: Number(cfg.aov) || DEFAULTS.cpa, // ojo: config.aov es el CPA real (deuda histórica)
      aov: Number(cfg.ticket_aov) || DEFAULTS.aov,
      testsPerWeek: DEFAULTS.testsPerWeek,
      testBudgetMultiplier: Number(cfg.kill_rule_multiplier) || DEFAULTS.testBudgetMultiplier,
      winRate: DEFAULTS.winRate,
      capacityPerWinner: DEFAULTS.capacityPerWinner,
      maxGrowthRate: DEFAULTS.maxGrowthRate,
    };
  }, [board?.config]);

  // ─── Estado del cliente ───
  const [currentBudget, setCurrentBudget] = useState(initial.currentBudget);
  const [targetBudget, setTargetBudget] = useState(initial.targetBudget);
  const [cpa, setCpa] = useState(initial.cpa);
  const [aov, setAov] = useState(initial.aov);

  // ─── Estrategia ───
  const [testsPerWeek, setTestsPerWeek] = useState(initial.testsPerWeek);
  const [testBudgetMultiplier, setTestBudgetMultiplier] = useState(initial.testBudgetMultiplier);
  const [winRate, setWinRate] = useState(initial.winRate);
  const [capacityPerWinner, setCapacityPerWinner] = useState(initial.capacityPerWinner);
  const [maxGrowthRate, setMaxGrowthRate] = useState(initial.maxGrowthRate);

  // ─── Planificador ───
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [targetMonthlyRevenue, setTargetMonthlyRevenue] = useState(DEFAULTS.targetMonthlyRevenue);
  const [targetWeeks, setTargetWeeks] = useState(DEFAULTS.targetWeeks);

  // ─── Persistencia ───
  const [activeScenarioId, setActiveScenarioId] = useState(null);
  const [activeScenarioName, setActiveScenarioName] = useState("");
  const [activeScenarioDescription, setActiveScenarioDescription] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Marcamos dirty con cualquier cambio (no granular — basta para confirm al cerrar).
  useEffect(() => { setIsDirty(true); }, [
    currentBudget, targetBudget, cpa, aov,
    testsPerWeek, testBudgetMultiplier, winRate, capacityPerWinner, maxGrowthRate,
  ]);

  // Cierre con Escape + confirm si hay cambios.
  const tryClose = () => {
    if (isDirty && !confirm("Tenés cambios sin guardar. ¿Cerrar igual?")) return;
    onClose?.();
  };
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") tryClose(); };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Simulación + summary ───
  const simInputs = useMemo(() => ({
    currentBudget, targetBudget, cpa, aov,
    testsPerWeek, testBudgetMultiplier, winRate, capacityPerWinner, maxGrowthRate,
  }), [currentBudget, targetBudget, cpa, aov, testsPerWeek, testBudgetMultiplier, winRate, capacityPerWinner, maxGrowthRate]);

  const rows = useMemo(() => simulate(simInputs), [simInputs]);
  const summary = useMemo(() => summarize(rows, simInputs), [rows, simInputs]);

  const planResult = useMemo(() => plan({
    targetMonthlyRevenue, targetWeeks,
    currentBudget, cpa, aov, capacityPerWinner,
  }), [targetMonthlyRevenue, targetWeeks, currentBudget, cpa, aov, capacityPerWinner]);

  // Aplicar escenario del planificador inverso
  const tableRef = useRef(null);
  const applyPlannerScenario = (s) => {
    setTestsPerWeek(s.testsPerWeek);
    setWinRate(s.winRate);
    setMaxGrowthRate(s.growthRate);
    setTargetBudget(s.targetBudget);
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // Cargar escenario guardado → autocompleta TODO
  const loadScenario = (s) => {
    setCurrentBudget(Number(s.current_budget_weekly));
    setTargetBudget(Number(s.target_budget_weekly));
    setCpa(Number(s.cpa));
    setAov(Number(s.ticket_aov));
    setTestsPerWeek(Number(s.tests_per_week));
    setTestBudgetMultiplier(Number(s.test_budget_multiplier));
    setWinRate(Number(s.win_rate));
    setCapacityPerWinner(Number(s.capacity_per_winner));
    setMaxGrowthRate(Number(s.max_growth_rate));
    if (s.planner_target_monthly_revenue) setTargetMonthlyRevenue(Number(s.planner_target_monthly_revenue));
    if (s.planner_target_weeks) setTargetWeeks(Number(s.planner_target_weeks));
    setActiveScenarioId(s.id);
    setActiveScenarioName(s.name);
    setActiveScenarioDescription(s.description || "");
    setShowListDialog(false);
    setTimeout(() => setIsDirty(false), 100);
  };

  // Guardar escenario (actual o nuevo)
  const handleSave = async ({ name, description, overwrite }) => {
    const payload = {
      company_id: companyId,
      board_id: board?.id || null,
      name,
      description: description || null,
      current_budget_weekly: currentBudget,
      target_budget_weekly: targetBudget,
      cpa,
      ticket_aov: aov,
      tests_per_week: testsPerWeek,
      test_budget_multiplier: testBudgetMultiplier,
      win_rate: winRate,
      capacity_per_winner: capacityPerWinner,
      max_growth_rate: maxGrowthRate,
      planner_target_monthly_revenue: targetMonthlyRevenue,
      planner_target_weeks: targetWeeks,
      cached_weeks_to_target: summary.reachedTarget ? summary.weeks : null,
      cached_monthly_lift: Math.round(summary.monthlyLiftRevenue),
      cached_total_investment: Math.round(summary.totalInvestment),
      cached_final_roas: Number(summary.finalRoas?.toFixed(2)) || null,
    };

    if (overwrite && activeScenarioId) {
      const { data, error } = await updateScenario(activeScenarioId, payload);
      if (error) throw error;
      setActiveScenarioName(data.name);
      setActiveScenarioDescription(data.description || "");
    } else {
      const { data, error } = await createScenario(payload);
      if (error) throw error;
      setActiveScenarioId(data.id);
      setActiveScenarioName(data.name);
      setActiveScenarioDescription(data.description || "");
    }
    setIsDirty(false);
  };

  // ─── Render ───
  const overlayBg = "rgba(0,0,0,0.65)";
  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const modalBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <>
      <div
        onClick={tryClose}
        style={{
          position: "fixed", inset: 0, zIndex: 10005,
          background: overlayBg,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20, fontFamily: T.font, overflowY: "auto",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "100%", maxWidth: 920, maxHeight: "92vh",
            background: modalBg, border: modalBorder, borderRadius: 16,
            color: T.textPrimary, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "16px 22px", borderBottom: modalBorder,
            display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                🎯 Simulador de escala
                {activeScenarioName && (
                  <span style={{
                    fontSize: 11, fontWeight: 500, color: T.textMuted,
                    padding: "2px 8px", borderRadius: 50,
                    background: "rgba(127,127,127,0.12)",
                  }}>{activeScenarioName}{isDirty && " •"}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                Modelá cuánto, cómo y en qué tiempo escalar la cuenta del cliente.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <HeaderBtn onClick={() => setShowListDialog(true)} T={T} isDark={isDark}>📂 Cargar</HeaderBtn>
              <HeaderBtn onClick={() => setShowSaveDialog(true)} primary T={T} isDark={isDark}>💾 Guardar</HeaderBtn>
              <HeaderBtn onClick={tryClose} T={T} isDark={isDark} icon>×</HeaderBtn>
            </div>
          </div>

          {/* Body scrolleable */}
          <div style={{ overflowY: "auto", padding: "20px 22px 28px", flex: 1 }}>
            {/* Planificador colapsable */}
            <Section
              title="Planificador de objetivo"
              hint="Decile cuánto querés vender y en cuánto tiempo. Te propongo 3 escenarios."
              T={T} isDark={isDark}
              collapsible
              open={plannerOpen}
              onToggle={() => setPlannerOpen((v) => !v)}
            >
              {plannerOpen && (
                <ScenarioPlannerSection
                  T={T} isDark={isDark}
                  targetMonthlyRevenue={targetMonthlyRevenue}
                  setTargetMonthlyRevenue={setTargetMonthlyRevenue}
                  targetWeeks={targetWeeks}
                  setTargetWeeks={setTargetWeeks}
                  planResult={planResult}
                  onApply={applyPlannerScenario}
                />
              )}
            </Section>

            {/* Estado del cliente */}
            <Section title="Estado del cliente" hint="De dónde partís y hasta dónde querés llegar." T={T} isDark={isDark}>
              <SliderGrid>
                <SliderRow
                  label="Budget actual / sem" hint="Inversión semanal hoy (operativo)"
                  T={T}
                  min={500_000} max={200_000_000} step={100_000}
                  value={currentBudget} onChange={setCurrentBudget}
                  format={fmtCOP}
                />
                <SliderRow
                  label="Budget objetivo / sem" hint="A dónde querés llevar la inversión semanal"
                  T={T}
                  min={500_000} max={300_000_000} step={100_000}
                  value={targetBudget} onChange={setTargetBudget}
                  format={fmtCOP}
                />
                <SliderRow
                  label="CPA target" hint="Lo que estás dispuesto a pagar por cada compra"
                  T={T}
                  min={5_000} max={2_000_000} step={1_000}
                  value={cpa} onChange={setCpa}
                  format={fmtCOP}
                />
                <SliderRow
                  label="Ticket promedio (AOV)" hint="Lo que te paga cada cliente — lo que cobrás por venta"
                  T={T}
                  min={5_000} max={5_000_000} step={1_000}
                  value={aov} onChange={setAov}
                  format={fmtCOP}
                />
              </SliderGrid>
            </Section>

            {/* Estrategia */}
            <Section title="Tu estrategia" hint="Cómo planeás producir y escalar." T={T} isDark={isDark}>
              <SliderGrid>
                <SliderRow
                  label="Tests por semana" hint="Creativos nuevos a probar cada semana"
                  T={T}
                  min={1} max={150} step={1}
                  value={testsPerWeek} onChange={setTestsPerWeek}
                  format={(n) => `${n}`}
                />
                <SliderRow
                  label="Multiplicador de test" hint="Cuántas × CPA recibe cada test antes de matarlo"
                  T={T}
                  min={1} max={5} step={0.1}
                  value={testBudgetMultiplier} onChange={setTestBudgetMultiplier}
                  format={(n) => `${n.toFixed(1)}×`}
                />
                <SliderRow
                  label="Win rate" hint="Fracción de tests que sobreviven y pasan a ganadores"
                  T={T}
                  min={0.05} max={0.60} step={0.01}
                  value={winRate} onChange={setWinRate}
                  format={(n) => `${Math.round(n * 100)}%`}
                />
                <SliderRow
                  label="Capacidad por ganador" hint="Cuánto absorbe cada ganador sin degradar el CPA"
                  T={T}
                  min={100_000} max={2_000_000} step={50_000}
                  value={capacityPerWinner} onChange={setCapacityPerWinner}
                  format={fmtCOP}
                />
                <SliderRow
                  label="Max crecimiento sem" hint="Cap de crecimiento del operativo por semana"
                  T={T}
                  min={0.05} max={2.00} step={0.05}
                  value={maxGrowthRate} onChange={setMaxGrowthRate}
                  format={(n) => `${Math.round(n * 100)}%`}
                />
              </SliderGrid>
            </Section>

            {/* Leyenda dots */}
            <div style={{
              display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12,
              fontSize: 11, color: T.textSecondary,
            }}>
              <Legend color="#3B8BD4" label="Limitado por ganadores disponibles" />
              <Legend color="#EF9F27" label="Limitado por cap de estabilidad" />
              <Legend color="#1D9E75" label="Llegó al objetivo" />
            </div>

            {/* Tabla */}
            <div ref={tableRef} style={{ marginBottom: 22 }}>
              <ProjectionTable rows={rows} isDark={isDark} T={T} />
            </div>

            {/* Vista ejecutiva */}
            <ExecutiveSummary
              inputs={simInputs}
              summary={summary}
              T={T}
              isDark={isDark}
            />
          </div>
        </div>
      </div>

      {showSaveDialog && (
        <SaveScenarioDialog
          T={T} isDark={isDark}
          defaultName={activeScenarioName || ""}
          defaultDescription={activeScenarioDescription || ""}
          canOverwrite={!!activeScenarioId}
          onSave={handleSave}
          onClose={() => setShowSaveDialog(false)}
        />
      )}

      {showListDialog && (
        <ScenariosListDialog
          T={T} isDark={isDark}
          companyId={companyId}
          onLoad={loadScenario}
          onClose={() => setShowListDialog(false)}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────

function fmtCOP(n) {
  if (!isFinite(n) || n == null) return "—";
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function HeaderBtn({ children, onClick, primary, icon, T, isDark }) {
  let style = {
    padding: icon ? "4px 10px" : "7px 14px",
    borderRadius: 50, cursor: "pointer",
    fontSize: icon ? 16 : 12, fontWeight: 600,
    fontFamily: T.font,
    border: `1px solid ${T.textHint}`,
    background: "transparent",
    color: T.textSecondary,
    lineHeight: 1,
  };
  if (primary) {
    style = {
      ...style,
      background: isDark ? "#EBEBEB" : "#1A1D1C",
      color: isDark ? "#1A1D1C" : "#FFFFFF",
      border: "none",
    };
  }
  return <button onClick={onClick} style={style}>{children}</button>;
}

function Section({ title, hint, children, T, isDark, collapsible, open, onToggle }) {
  return (
    <div style={{
      marginBottom: 22, paddingBottom: 18,
      borderBottom: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.05)",
    }}>
      <div
        onClick={collapsible ? onToggle : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 10, cursor: collapsible ? "pointer" : "default",
          userSelect: "none",
        }}
      >
        {collapsible && (
          <span style={{ fontSize: 10, color: T.textMuted, transition: "transform 0.15s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
        )}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
          {hint && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 1 }}>{hint}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SliderGrid({ children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gap: 12,
    }}>
      {children}
    </div>
  );
}

function SliderRow({ label, hint, T, min, max, step, value, onChange, format }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textPrimary }}>{label}</div>
        <span style={{
          fontSize: 11.5, fontWeight: 600,
          padding: "2px 9px", borderRadius: 50,
          background: "rgba(127,127,127,0.12)",
          fontVariantNumeric: "tabular-nums",
        }}>
          {format ? format(value) : value}
        </span>
      </div>
      {hint && <div style={{ fontSize: 10.5, color: T.textMuted, marginBottom: 6 }}>{hint}</div>}
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ width: "100%", cursor: "pointer", accentColor: "#1D9E75" }}
      />
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}

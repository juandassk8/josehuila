import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import {
  currentWeekIso,
  getWeeklyPlan,
  upsertWeeklyPlan,
  generateSlotsFromPlan,
  countSlotsForWeek,
} from "./pipeline_db.js";
import { logger } from "../lib/logger.js";

const STAGES = [
  { key: "tofu", label: "TOFU", color: "#1D9E75" },
  { key: "mofu", label: "MOFU", color: "#D4A93B" },
  { key: "bofu", label: "BOFU", color: "#E24B4A" },
];

export function WeeklyPlanModal({ board, concepts, onClose, onGenerated }) {
  const { isDark } = useTheme();
  const T = DS;

  const [weekIso, setWeekIso] = useState(currentWeekIso());
  const [spend, setSpend] = useState(String(board?.config?.weekly_spend || ""));
  const [aov, setAov] = useState(String(board?.config?.aov || ""));
  const [mult, setMult] = useState(String(board?.config?.kill_rule_multiplier || 3));
  const [scalePct, setScalePct] = useState(String(board?.config?.budget_split?.scale ?? 70));
  const [testingPct, setTestingPct] = useState(String(board?.config?.budget_split?.testing ?? 30));
  const [dist, setDist] = useState({
    tofu: board?.config?.distribution?.tofu ?? 60,
    mofu: board?.config?.distribution?.mofu ?? 30,
    bofu: board?.config?.distribution?.bofu ?? 10,
  });

  const [selected, setSelected] = useState({});
  const [customCounts, setCustomCounts] = useState({});
  const [existingPlan, setExistingPlan] = useState(null);
  const [existingSlots, setExistingSlots] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!board?.id) return;
    let cancelled = false;
    (async () => {
      const [plan, slotsCount] = await Promise.all([
        getWeeklyPlan(board.id, weekIso),
        countSlotsForWeek(board.id, weekIso),
      ]);
      if (cancelled) return;
      setExistingPlan(plan);
      setExistingSlots(slotsCount);
      if (plan) {
        if (plan.spend) setSpend(String(plan.spend));
        if (plan.aov) setAov(String(plan.aov));
        if (plan.kill_rule_multiplier) setMult(String(plan.kill_rule_multiplier));
        if (plan.distribution) setDist(plan.distribution);
        if (plan.budget_split) {
          if (plan.budget_split.scale != null) setScalePct(String(plan.budget_split.scale));
          if (plan.budget_split.testing != null) setTestingPct(String(plan.budget_split.testing));
        }
        if (Array.isArray(plan.active_concepts)) {
          const map = {};
          for (const ac of plan.active_concepts) map[ac.concept_id] = true;
          setSelected(map);
        }
      } else {
        const map = {};
        for (const c of concepts) map[c.id] = true;
        setSelected(map);
      }
    })();
    return () => { cancelled = true; };
  }, [board?.id, weekIso]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const spendNum = Number(spend) || 0;
  const aovNum = Number(aov) || 0;
  const multNum = Number(mult) || 3;
  const budgetPerCreative = aovNum * multNum;

  const scaleN = Number(scalePct) || 0;
  const testingN = Number(testingPct) || 0;
  const splitSum = scaleN + testingN;
  const splitValid = Math.abs(splitSum - 100) < 0.01;
  const scaleBudget = spendNum * (scaleN / 100);
  const testingBudget = spendNum * (testingN / 100);

  // Solo el budget de testing financia creativos nuevos.
  const totalCreatives = (budgetPerCreative > 0 && testingBudget > 0)
    ? Math.floor(testingBudget / budgetPerCreative)
    : 0;

  // Auto-balance del split.
  const setScaleBalanced = (v) => {
    const clean = String(v).replace(/[^\d.]/g, "");
    setScalePct(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setTestingPct(String(Math.round((100 - n) * 100) / 100));
  };
  const setTestingBalanced = (v) => {
    const clean = String(v).replace(/[^\d.]/g, "");
    setTestingPct(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setScalePct(String(Math.round((100 - n) * 100) / 100));
  };

  const perStage = {
    tofu: Math.round((totalCreatives * (dist.tofu || 0)) / 100),
    mofu: Math.round((totalCreatives * (dist.mofu || 0)) / 100),
    bofu: Math.round((totalCreatives * (dist.bofu || 0)) / 100),
  };

  const conceptsByStage = useMemo(() => {
    const map = { tofu: [], mofu: [], bofu: [] };
    for (const c of concepts) {
      if (map[c.stage]) map[c.stage].push(c);
    }
    return map;
  }, [concepts]);

  const recommendedByConcept = useMemo(() => {
    const out = {};
    for (const stage of ["tofu", "mofu", "bofu"]) {
      const list = (conceptsByStage[stage] || []).filter((c) => selected[c.id]);
      const total = perStage[stage];
      if (list.length === 0 || total === 0) {
        for (const c of conceptsByStage[stage] || []) out[c.id] = 0;
        continue;
      }
      const base = Math.floor(total / list.length);
      const remainder = total - base * list.length;
      list.forEach((c, i) => { out[c.id] = base + (i < remainder ? 1 : 0); });
    }
    return out;
  }, [selected, conceptsByStage, perStage.tofu, perStage.mofu, perStage.bofu]);

  const slotsByConcept = useMemo(() => {
    const out = {};
    for (const c of concepts) {
      if (!selected[c.id]) { out[c.id] = 0; continue; }
      out[c.id] = customCounts[c.id] !== undefined
        ? Math.max(0, Number(customCounts[c.id]) || 0)
        : (recommendedByConcept[c.id] || 0);
    }
    return out;
  }, [concepts, selected, customCounts, recommendedByConcept]);

  const totalSlotsToCreate = Object.values(slotsByConcept).reduce((s, n) => s + n, 0);

  const toggleConcept = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const setCount = (id, val) => setCustomCounts((c) => ({ ...c, [id]: val }));
  const resetCount = (id) => setCustomCounts((c) => {
    const n = { ...c }; delete n[id]; return n;
  });
  const resetAllCounts = () => setCustomCounts({});
  const setDistVal = (stage, val) => {
    const v = Math.max(0, Math.min(100, Number(val) || 0));
    setDist((d) => ({ ...d, [stage]: v }));
  };

  const distSum = (dist.tofu || 0) + (dist.mofu || 0) + (dist.bofu || 0);
  const distValid = Math.abs(distSum - 100) < 1;

  const generate = async () => {
    if (!splitValid) {
      setError("La distribución del presupuesto (escalar + testing) debe sumar 100%.");
      return;
    }
    if (!distValid) {
      setError("La distribución por etapa debe sumar 100%.");
      return;
    }
    if (totalSlotsToCreate === 0) {
      setError("Selecciona al menos un concepto y verifica la inversión/AOV.");
      return;
    }
    if (existingSlots > 0) {
      if (!confirm(`Ya hay ${existingSlots} slots creados para ${weekIso}. ¿Crear ${totalSlotsToCreate} más? (Los existentes NO se borran)`)) return;
    }
    setSaving(true);
    setError(null);
    try {
      const active_concepts = concepts
        .filter((c) => selected[c.id] && (slotsByConcept[c.id] || 0) > 0)
        .map((c) => ({
          concept_id: c.id,
          concept_name: c.name,
          stage: c.stage,
          format: c.format,
          slots_count: slotsByConcept[c.id] || 0,
        }));

      const plan = await upsertWeeklyPlan({
        board_id: board.id,
        week_iso: weekIso,
        spend: spendNum,
        aov: aovNum,
        kill_rule_multiplier: multNum,
        budget_split: { scale: scaleN, testing: testingN },
        distribution: dist,
        active_concepts,
        total_slots: totalSlotsToCreate,
      });

      const slots = await generateSlotsFromPlan({
        boardId: board.id,
        weeklyPlanId: plan.id,
        weekIso,
        activeConcepts: active_concepts,
      });

      onGenerated?.(slots);
      onClose?.();
    } catch (e) {
      logger.error("generate failed", e);
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const modalBg = isDark ? "#0E0E14" : "#FDFDFB";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
  const green = isDark ? "#3FCF9B" : "#1D9E75";

  return (
    <div
      onClick={onClose}
      data-modal
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: modalBg, borderRadius: 14, padding: "24px 28px",
          width: "100%", maxWidth: 720, maxHeight: "90vh", overflowY: "auto",
          color: T.textPrimary,
          border: divider,
          boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Planear semana
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em", color: T.textPrimary }}>
              Generar slots para {weekIso}
            </div>
          </div>
          <button onClick={onClose} style={iconBtn(isDark, T)}>×</button>
        </div>

        <Field label="Semana ISO" T={T}>
          <input
            type="text"
            value={weekIso}
            onChange={(e) => setWeekIso(e.target.value)}
            placeholder="2026-W17"
            style={input(isDark, T)}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <Field label="¿Cuánto inviertes por semana?" hint="En pesos colombianos" T={T}>
            <MoneyInput value={spend} onChange={setSpend} placeholder="10.000.000" isDark={isDark} T={T} />
          </Field>
          <Field label="¿Cuál es tu ticket promedio?" hint="Venta promedio en COP" T={T}>
            <MoneyInput value={aov} onChange={setAov} placeholder="100.000" isDark={isDark} T={T} />
          </Field>
          <Field label="Presupuesto de prueba" hint="Veces el AOV por creativo" T={T}>
            <input
              type="number"
              min={1}
              value={mult}
              onChange={(e) => setMult(e.target.value)}
              style={input(isDark, T)}
            />
          </Field>
        </div>

        {/* Distribución del presupuesto — escalar vs testing */}
        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          Distribución del presupuesto
        </div>
        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
          Cuánto del presupuesto se usa para escalar ganadores vs probar creativos nuevos.
        </div>
        <div data-tour="distribucion-slider" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
          <SplitBox
            label="Escalar ganadores"
            value={scalePct}
            onChange={setScaleBalanced}
            color={isDark ? "#3FCF9B" : "#1D9E75"}
            budget={scaleBudget}
            isDark={isDark}
            T={T}
          />
          <SplitBox
            label="Testing"
            value={testingPct}
            onChange={setTestingBalanced}
            color={isDark ? "#E8B34B" : "#D4A93B"}
            budget={testingBudget}
            isDark={isDark}
            T={T}
          />
        </div>
        <div style={{ fontSize: 11, marginBottom: 14, color: splitValid ? (isDark ? "#3FCF9B" : "#1D9E75") : T.red }}>
          Suma: {Math.round(splitSum * 100) / 100}% {splitValid ? "✓" : "✗ (debe ser 100)"}
        </div>

        <div style={{
          padding: "12px 16px", borderRadius: 10,
          background: isDark ? "rgba(29,185,122,0.1)" : "rgba(29,158,117,0.08)",
          border: `1px solid ${isDark ? "rgba(29,185,122,0.3)" : "rgba(29,158,117,0.25)"}`,
          marginBottom: 18, fontSize: 12, color: T.textPrimary, lineHeight: 1.6,
        }}>
          💡 Cada creativo recibe un presupuesto de prueba de <strong>{multNum}× tu AOV = ${fmt(budgetPerCreative)}</strong>.
          {testingN > 0 && testingBudget >= budgetPerCreative && (
            <> Con el <strong>{Math.round(testingN)}% destinado a testing (${fmt(testingBudget)})</strong>, necesitas producir <strong style={{ color: green }}>{totalCreatives} creativos/semana</strong>.</>
          )}
          {testingN === 0 && (
            <span style={{ color: T.red }}> Asigná un % a testing para poder probar creativos nuevos.</span>
          )}
          {testingN > 0 && testingBudget < budgetPerCreative && (
            <span style={{ color: T.red }}> Tu presupuesto de testing (${fmt(testingBudget)}) no alcanza para un creativo completo (${fmt(budgetPerCreative)}).</span>
          )}
        </div>

        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
          Distribución por etapa
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          {STAGES.map((s) => (
            <div key={s.key} style={{
              padding: "10px 12px", borderRadius: 8,
              background: `${s.color}${isDark ? "18" : "10"}`,
              border: `1px solid ${s.color}${isDark ? "66" : "44"}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.label}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={dist[s.key]}
                  onChange={(e) => setDistVal(s.key, e.target.value)}
                  style={{ ...input(isDark, T), padding: "4px 6px", fontSize: 13, width: 60 }}
                />
                <span style={{ fontSize: 11, color: T.textSecondary }}>%</span>
                <span style={{ marginLeft: "auto", fontSize: 11, color: T.textSecondary, fontWeight: 700 }}>
                  {perStage[s.key]} creat.
                </span>
              </div>
            </div>
          ))}
        </div>
        {!distValid && (
          <div style={{ fontSize: 11, color: T.red, marginBottom: 10 }}>
            La distribución suma {distSum}%, debe sumar 100%.
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Conceptos a producir esta semana
          </div>
          {Object.keys(customCounts).length > 0 && (
            <button
              onClick={resetAllCounts}
              style={{
                background: "transparent", border: "none",
                fontSize: 10, color: T.blue, cursor: "pointer",
                textDecoration: "underline", fontFamily: "inherit",
              }}
            >
              Volver a la recomendación
            </button>
          )}
        </div>

        <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
          El sistema recomienda un reparto equitativo basado en tu distribución.
          Puedes ajustar cuántos quieres producir de cada concepto.
        </div>

        {STAGES.map((s) => {
          const list = conceptsByStage[s.key] || [];
          if (list.length === 0) {
            return (
              <div key={s.key} style={{ marginBottom: 10, fontSize: 11, color: T.textMuted, fontStyle: "italic" }}>
                {s.label}: sin conceptos creados en el canvas. Agrégalos desde el tablero estratégico.
              </div>
            );
          }
          const stageTotal = list
            .filter((c) => selected[c.id])
            .reduce((sum, c) => sum + (slotsByConcept[c.id] || 0), 0);
          return (
            <div key={s.key} style={{ marginBottom: 16 }}>
              <div style={{
                display: "flex", alignItems: "baseline", justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.color, letterSpacing: "0.04em" }}>
                  {s.label} <span style={{ fontWeight: 400, color: T.textMuted }}>· recomendado {perStage[s.key]}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: stageTotal === perStage[s.key] ? green : "#D4A93B" }}>
                  {stageTotal} / {perStage[s.key]}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {list.map((c) => {
                  const count = slotsByConcept[c.id] || 0;
                  const isSelected = !!selected[c.id];
                  const recommended = recommendedByConcept[c.id] || 0;
                  const isCustom = customCounts[c.id] !== undefined;
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 10px", borderRadius: 6,
                        border: isSelected
                          ? `1px solid ${s.color}${isDark ? "88" : "66"}`
                          : `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                        background: isSelected
                          ? `${s.color}${isDark ? "18" : "08"}`
                          : (isDark ? "rgba(255,255,255,0.03)" : "#fff"),
                        fontSize: 12,
                        color: T.textPrimary,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleConcept(c.id)}
                        style={{ cursor: "pointer", flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                        <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 400, marginLeft: 6 }}>
                          {c.format === "video" ? "🎬" : "🖼️"}
                        </span>
                      </span>
                      {isSelected && (
                        <>
                          <input
                            type="number"
                            min={0}
                            value={count}
                            onChange={(e) => setCount(c.id, e.target.value)}
                            title={isCustom ? `Recomendado: ${recommended}` : "Recomendación del sistema"}
                            style={{
                              width: 44, padding: "3px 6px", borderRadius: 4,
                              border: isCustom
                                ? `1px solid ${s.color}`
                                : `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
                              background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
                              fontSize: 12, fontWeight: 700,
                              color: s.color, textAlign: "center",
                              fontFamily: "monospace", outline: "none",
                            }}
                          />
                          {isCustom && (
                            <button
                              onClick={() => resetCount(c.id)}
                              title={`Recomendado: ${recommended}`}
                              style={{
                                background: "transparent", border: "none",
                                color: T.textMuted, cursor: "pointer",
                                fontSize: 10, padding: 0, fontFamily: "inherit",
                              }}
                            >
                              ↺
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{
          marginTop: 18, paddingTop: 14, borderTop: divider,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ fontSize: 12, color: T.textPrimary }}>
            Se crearán <strong>{totalSlotsToCreate}</strong> slots en la columna Idea.
            {existingSlots > 0 && (
              <span style={{ color: "#D4A93B", marginLeft: 8, fontSize: 11 }}>
                ⚠ Ya hay {existingSlots} slots en esta semana.
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} disabled={saving} style={ghostBtn(isDark, T)}>Cancelar</button>
            <button
              onClick={generate}
              disabled={saving || totalSlotsToCreate === 0 || !distValid || !splitValid}
              style={{
                ...primaryBtn(isDark),
                opacity: (saving || totalSlotsToCreate === 0 || !distValid || !splitValid) ? 0.5 : 1,
              }}
            >
              {saving ? "Generando…" : `Generar ${totalSlotsToCreate} slots`}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.red }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function SplitBox({ label, value, onChange, color, budget, isDark, T }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      border: `1.5px solid ${color}${isDark ? "55" : "33"}`,
      background: `${color}${isDark ? "14" : "08"}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 70, padding: "4px 8px", borderRadius: 6,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
            background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
            color: T.textPrimary, fontSize: 14, fontWeight: 700,
            fontFamily: "inherit", outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: T.textMuted }}>%</span>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
        ≈ ${Math.round(budget || 0).toLocaleString("es-CO")} COP
      </div>
    </div>
  );
}

function Field({ label, hint, children, T }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, placeholder, isDark, T }) {
  const digits = String(value || "").replace(/\D/g, "");
  const formatted = digits ? Number(digits).toLocaleString("es-CO") : "";
  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
        fontSize: 13, color: T.textMuted, fontWeight: 600, pointerEvents: "none",
      }}>$</span>
      <input
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          onChange(raw);
        }}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 10px 8px 22px", borderRadius: 6,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
          background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
          color: T.textPrimary, fontSize: 13, fontFamily: "inherit",
          outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function input(isDark, T) {
  return {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
    background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
    color: T.textPrimary,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
}

function ghostBtn(isDark, T) {
  return {
    padding: "8px 16px",
    borderRadius: 50,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
    background: "transparent",
    color: T.textPrimary,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function primaryBtn(isDark) {
  return {
    padding: "9px 18px",
    borderRadius: 50,
    border: "none",
    background: isDark ? "#EBEBEB" : "#1A1D1C",
    color: isDark ? "#06060A" : "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function iconBtn(isDark, T) {
  return {
    width: 28, height: 28, borderRadius: 6,
    border: "none",
    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    color: T.textSecondary, cursor: "pointer", fontSize: 18,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit",
  };
}

function fmt(n) {
  return Math.round(n || 0).toLocaleString("es-CO");
}

import { useEffect, useMemo, useState } from "react";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { updateBoardConfig, applyTargetsToConcepts } from "./db.js";
import { planDeCadencia, PCT_CADENCIA_DEFAULT } from "./cadencia.js";

// Calcula cuántos creativos hay que producir por semana en base a la inversión
// semanal y el ticket promedio (AOV), aplicando la regla del media buyer:
// cada creativo recibe 3× AOV de presupuesto de prueba antes de descartarlo.
// Todo en pesos colombianos (COP).
const fmtCOP = (n) => `$${Math.round(n || 0).toLocaleString("es-CO")}`;

export function ConfigModal({ board, onClose, onSaved }) {
  const { isDark } = useTheme();
  const T = DS;
  const existing = board?.config || {};
  const [weeklySpend, setWeeklySpend] = useState(existing.weekly_spend ? String(existing.weekly_spend) : "");
  const [aov, setAov] = useState(existing.aov ? String(existing.aov) : "");
  // Ticket promedio REAL (lo que cobrás por venta). Distinto de `aov` arriba,
  // que históricamente almacena el CPA. Lo usa el Simulador de Escala.
  const [ticketAov, setTicketAov] = useState(existing.ticket_aov ? String(existing.ticket_aov) : "");
  // Multiplicador seleccionable por el usuario (1, 1.5, 2, 2.5, 3, 4, 5).
  const [killMult, setKillMult] = useState(String(existing.kill_rule_multiplier ?? 3));
  // Split del presupuesto semanal: escalar ganadores vs testing nuevo.
  // Solo la parte de testing se usa para calcular cuántos creativos nuevos
  // hay que producir por semana (el resto se invierte en ganadores ya validados).
  const [scalePct, setScalePct] = useState(String(existing.budget_split?.scale ?? 70));
  const [testingPct, setTestingPct] = useState(String(existing.budget_split?.testing ?? 30));
  const [tofuPct, setTofuPct] = useState(String(existing.distribution?.tofu ?? 60));
  const [mofuPct, setMofuPct] = useState(String(existing.distribution?.mofu ?? 30));
  const [bofuPct, setBofuPct] = useState(String(existing.distribution?.bofu ?? 10));
  // Qué parte del tope se produce de verdad. Ver src/despliegue/cadencia.js: es
  // un porcentaje del TOPE, no de la plata — no confundir con `testingPct`.
  const [cadenciaPct, setCadenciaPct] = useState(String(existing.cadence_pct ?? PCT_CADENCIA_DEFAULT));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const spend = parseFloat(weeklySpend) || 0;
  const avgOrder = parseFloat(aov) || 0;
  const mult = parseFloat(killMult) || 3;
  const budgetPerCreative = avgOrder * mult;

  // Split de presupuesto (escalar ganadores vs testing nuevo).
  const scaleN = parseFloat(scalePct) || 0;
  const testingN = parseFloat(testingPct) || 0;
  const splitTotal = scaleN + testingN;
  const splitValid = Math.abs(splitTotal - 100) < 0.01;
  const scaleBudget = spend * (scaleN / 100);
  const testingBudget = spend * (testingN / 100);

  // Solo el budget de testing financia creativos nuevos. Floor — no prometer
  // un creativo que no se puede pagar completo.
  // El tope: lo máximo que el presupuesto de testeo puede pagar.
  const minCreatives = (budgetPerCreative > 0 && testingBudget > 0)
    ? Math.floor(testingBudget / budgetPerCreative)
    : 0;

  // Auto-balance: editar un lado ajusta el otro a 100 - X.
  const setScaleBalanced = (v) => {
    const clean = v.replace(/[^\d.]/g, "");
    setScalePct(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setTestingPct(String(Math.round((100 - n) * 100) / 100));
  };
  const setTestingBalanced = (v) => {
    const clean = v.replace(/[^\d.]/g, "");
    setTestingPct(clean);
    const n = parseFloat(clean);
    if (!isNaN(n) && n >= 0 && n <= 100) setScalePct(String(Math.round((100 - n) * 100) / 100));
  };

  const tofuN = parseFloat(tofuPct) || 0;
  const mofuN = parseFloat(mofuPct) || 0;
  const bofuN = parseFloat(bofuPct) || 0;
  const pctTotal = tofuN + mofuN + bofuN;
  const pctValid = Math.abs(pctTotal - 100) < 0.01;

  // El plan completo: tope -> producción (40%) -> reparto por embudo.
  //
  // El reparto se aplica a la PRODUCCIÓN. Antes colgaba del tope, así que el
  // tablero pedía 45 TOFU donde correspondían 18: dos veces y media el trabajo.
  // Una meta imposible no se cumple a medias, se ignora entera.
  const plan = useMemo(() => planDeCadencia({
    pautaSemanal: spend, pctTesteo: testingN,
    cpaObjetivo: avgOrder, multiplicadorPrueba: mult,
    pctCadencia: parseFloat(cadenciaPct) || 0,
    reparto: { tofu: tofuN, mofu: mofuN, bofu: bofuN },
  }), [spend, testingN, avgOrder, mult, cadenciaPct, tofuN, mofuN, bofuN]);

  const preview = useMemo(() => plan.porEtapa, [plan]);

  const ticketAovNum = parseFloat(ticketAov) || 0;

  const buildConfig = () => ({
    ...existing,
    weekly_spend: spend,
    aov: avgOrder,
    ticket_aov: ticketAovNum || null,
    kill_rule_multiplier: mult,
    budget_split: { scale: scaleN, testing: testingN },
    distribution: { tofu: tofuN, mofu: mofuN, bofu: bofuN },
    cadence_pct: parseFloat(cadenciaPct) || PCT_CADENCIA_DEFAULT,
  });

  const handleSave = async (applyToConcepts) => {
    if (!splitValid) {
      setError("La distribución del presupuesto (escalar + testing) debe sumar 100.");
      return;
    }
    if (!pctValid) {
      setError("Los porcentajes del embudo deben sumar 100.");
      return;
    }
    if (spend <= 0 || avgOrder <= 0) {
      setError("Completa inversión semanal y ticket promedio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const config = buildConfig();
      await updateBoardConfig(board.id, config);
      if (applyToConcepts) {
        if (!confirm("Esto sobrescribe la meta semanal de todos los conceptos activos. ¿Continuar?")) {
          setSaving(false);
          return;
        }
        await applyTargetsToConcepts(board.id, preview);
      }
      await onSaved?.();
      onClose?.();
    } catch (e) {
      setError(e?.message || String(e));
      setSaving(false);
    }
  };

  const modalBg = isDark ? "#0E0E14" : "#FFFFFF";
  const hintBg = isDark ? "rgba(255,255,255,0.04)" : "#F5F5F0";
  const divider = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";

  return (
    <div
      onClick={onClose}
      data-modal
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        zIndex: 10002, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: T.font, overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: modalBg, border: divider,
          borderRadius: 14, width: "100%", maxWidth: 540,
          padding: "24px 28px", color: T.textPrimary,
          boxShadow: isDark ? "0 20px 60px rgba(0,0,0,0.6)" : "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.textPrimary }}>Cadencia de creativos</div>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
            Calcula cuántos creativos producir a la semana según la inversión del cliente.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 6 }}>
          <Field label="Inversión semanal" hint="En pesos colombianos (COP)" T={T}>
            <MoneyInput
              value={weeklySpend}
              onChange={setWeeklySpend}
              placeholder="10.000.000"
              isDark={isDark}
              T={T}
            />
          </Field>
          <Field label="Costo por compra promedio (CPA)" hint="Costo promedio de adquirir una compra (COP)" T={T}>
            <MoneyInput
              value={aov}
              onChange={setAov}
              placeholder="100.000"
              isDark={isDark}
              T={T}
            />
          </Field>
          <Field
            label="Ticket promedio por venta (AOV)"
            hint="Cuánto cobrás en promedio por cada venta. Distinto del CPA: esto es lo que te paga el cliente, no lo que pagás vos por adquirirlo. Lo usa el Simulador de Escala."
            T={T}
          >
            <MoneyInput
              value={ticketAov}
              onChange={setTicketAov}
              placeholder="500.000"
              isDark={isDark}
              T={T}
            />
          </Field>
        </div>

        {/* Multiplicador del presupuesto de prueba por creativo */}
        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 2 }}>
            Presupuesto de prueba por creativo
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
            Cuántas veces el CPA promedio se le da a cada creativo antes de descartarlo.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["1", "1.5", "2", "2.5", "3", "4", "5"].map((m) => {
              const active = parseFloat(killMult) === parseFloat(m);
              return (
                <button
                  key={m}
                  onClick={() => setKillMult(m)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 50,
                    border: active ? `1.5px solid ${isDark ? "#3FCF9B" : "#1D9E75"}` : `1px solid ${T.textHint}`,
                    background: active ? (isDark ? "rgba(63,207,155,0.14)" : "rgba(29,158,117,0.1)") : "transparent",
                    color: active ? (isDark ? "#3FCF9B" : "#1D9E75") : T.textSecondary,
                    fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", fontFamily: T.font,
                    minWidth: 44,
                  }}
                >
                  {m}×
                </button>
              );
            })}
          </div>
        </div>

        {/* Explicación en lenguaje claro */}
        <div style={{
          background: hintBg,
          border: divider,
          borderRadius: 10,
          padding: "12px 14px",
          marginTop: 10,
          marginBottom: 14,
          fontSize: 11,
          color: T.textSecondary,
          lineHeight: 1.5,
        }}>
          💡 Cada creativo recibe un presupuesto de prueba de <strong>{mult}× el CPA promedio</strong> antes de descartarlo.
          {budgetPerCreative > 0 && (
            <> Con tu CPA, eso son <strong style={{ color: T.textPrimary }}>{fmtCOP(budgetPerCreative)}</strong> por creativo.</>
          )}
        </div>

        {/* Ritmo de producción — el 40% del TOPE.
            Va pegado al split de presupuesto y con la etiqueta "% del tope"
            bien visible, porque el 30% y el 40% son justo los dos números que
            se confunden: uno reparte PLATA, el otro reparte TRABAJO. */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 2 }}>
            Ritmo de producción
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8, lineHeight: 1.55 }}>
            Qué parte del tope se produce de verdad. El tope es lo máximo que la plata paga;
            producir al tope baja la calidad y deja sin músculo para escalar lo que ya gana.
            El 40% es el punto de partida sano — subilo solo si te da el equipo.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input
              type="range" min={10} max={100} step={5}
              value={cadenciaPct}
              onChange={(e) => setCadenciaPct(e.target.value)}
              style={{ flex: "1 1 200px", accentColor: isDark ? "#3FCF9B" : "#1D9E75" }}
            />
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, minWidth: 96 }}>
              {Math.round(parseFloat(cadenciaPct) || 0)}% del tope
            </span>
          </div>
        </div>

        {/* Distribución del presupuesto — escalar vs testing */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, marginBottom: 2 }}>
            Distribución del presupuesto
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 8 }}>
            Cuánto del presupuesto semanal se invierte en escalar ganadores ya validados vs probar creativos nuevos.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SplitField
              label="Escalar ganadores"
              value={scalePct}
              onChange={setScaleBalanced}
              color={isDark ? "#3FCF9B" : "#1D9E75"}
              budget={scaleBudget}
              isDark={isDark}
              T={T}
            />
            <SplitField
              label="Testing"
              value={testingPct}
              onChange={setTestingBalanced}
              color={isDark ? "#E8B34B" : "#D4A93B"}
              budget={testingBudget}
              isDark={isDark}
              T={T}
            />
          </div>
          <div style={{ fontSize: 11, marginTop: 6, color: splitValid ? (isDark ? "#3FCF9B" : "#1D9E75") : T.red }}>
            Suma: {Math.round(splitTotal * 100) / 100}% {splitValid ? "✓" : "✗ (debe ser 100)"}
          </div>
        </div>

        {/* Resultado destacado */}
        <div style={{
          background: isDark ? "rgba(29,185,122,0.08)" : "#FFFFFF",
          border: `1.5px solid ${isDark ? "rgba(29,185,122,0.35)" : "rgba(29,158,117,0.2)"}`,
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 10, color: T.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
            Creativos a producir por semana
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: isDark ? "#3FCF9B" : "#1D9E75" }}>
              {plan.produccion || "—"}
            </div>
            {plan.tope > 0 && (
              <div style={{ fontSize: 12, color: T.textMuted }}>
                de un tope de {plan.tope} · quedan {plan.reservaParaEscalar} de músculo para escalar
              </div>
            )}
          </div>
          {spend > 0 && budgetPerCreative > 0 && testingN > 0 && testingBudget >= budgetPerCreative && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, lineHeight: 1.6 }}>
              {fmtCOP(testingBudget)} ({Math.round(testingN)}% de la pauta a testeo) ÷ {fmtCOP(budgetPerCreative)} = <strong>{plan.tope} de tope</strong>
              <br />
              {plan.tope} × {Math.round(parseFloat(cadenciaPct) || 0)}% del tope = <strong>{plan.produccion} a producir</strong>
            </div>
          )}
          {spend > 0 && budgetPerCreative > 0 && testingN === 0 && (
            <div style={{ fontSize: 11, color: T.red, marginTop: 6, lineHeight: 1.5 }}>
              Asigná al menos un % a testing para poder probar creativos nuevos.
            </div>
          )}
          {spend > 0 && budgetPerCreative > 0 && testingN > 0 && testingBudget < budgetPerCreative && (
            <div style={{ fontSize: 11, color: T.red, marginTop: 6, lineHeight: 1.5 }}>
              Tu presupuesto de testing ({fmtCOP(testingBudget)}) no alcanza para un creativo completo ({fmtCOP(budgetPerCreative)}). Subí el presupuesto semanal, bajá el multiplicador, o aumentá el % de testing.
            </div>
          )}
        </div>

        {/* Distribución */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: T.textPrimary }}>Distribución por embudo</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <PctField label="TOFU" value={tofuPct} onChange={setTofuPct} color="#1D9E75" preview={preview.tofu} isDark={isDark} T={T} />
            <PctField label="MOFU" value={mofuPct} onChange={setMofuPct} color="#D4A93B" preview={preview.mofu} isDark={isDark} T={T} />
            <PctField label="BOFU" value={bofuPct} onChange={setBofuPct} color="#B85B2E" preview={preview.bofu} isDark={isDark} T={T} />
          </div>
          <div style={{ fontSize: 11, marginTop: 6, color: pctValid ? T.textMuted : T.red }}>
            Suma: {pctTotal}% {pctValid ? "✓" : "(debe ser 100)"}
          </div>
        </div>

        {error && (
          <div style={{ color: T.red, fontSize: 12, marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, paddingTop: 14, borderTop: divider, flexWrap: "wrap" }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={btnGhost(isDark, T)}
          >
            Cancelar
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            style={btnSecondary(isDark)}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !pctValid || !splitValid}
            style={{
              ...btnPrimary(isDark),
              opacity: (!pctValid || !splitValid) ? 0.5 : 1,
              cursor: (!pctValid || !splitValid) ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Guardando…" : "Guardar y aplicar a conceptos"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children, T }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: T.textPrimary, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, placeholder, isDark, T }) {
  const display = value ? Number(value).toLocaleString("es-CO") : "";
  const handleChange = (e) => {
    const digits = e.target.value.replace(/[^\d]/g, "");
    onChange(digits);
  };
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}`,
      borderRadius: 8,
      background: isDark ? "rgba(255,255,255,0.04)" : "#FFFFFF",
      overflow: "hidden",
    }}>
      <span style={{
        padding: "9px 10px",
        fontSize: 13,
        color: T.textMuted,
        fontWeight: 600,
        background: isDark ? "rgba(255,255,255,0.06)" : "#F5F5F0",
        borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
      }}>$</span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: "9px 12px",
          border: "none",
          background: "transparent",
          color: T.textPrimary,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          minWidth: 0,
        }}
      />
    </div>
  );
}

function SplitField({ label, value, onChange, color, budget, isDark, T }) {
  return (
    <div style={{
      border: `1.5px solid ${color}${isDark ? "55" : "33"}`,
      borderRadius: 10,
      padding: "10px 12px",
      background: `${color}${isDark ? "14" : "08"}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 70,
            padding: "4px 8px",
            borderRadius: 6,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
            background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
            color: T.textPrimary,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            outline: "none",
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

function PctField({ label, value, onChange, color, preview, isDark, T }) {
  return (
    <div style={{
      border: `1.5px solid ${color}${isDark ? "55" : "33"}`,
      borderRadius: 10,
      padding: "10px 12px",
      background: `${color}${isDark ? "14" : "08"}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 60,
            padding: "4px 8px",
            borderRadius: 6,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
            background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
            color: T.textPrimary,
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: T.textMuted }}>%</span>
      </div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
        ≈ {preview} creativos
      </div>
    </div>
  );
}

function btnGhost(isDark, T) {
  return {
    padding: "9px 16px", borderRadius: 50,
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.1)"}`,
    background: "transparent", color: T.textSecondary,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };
}
function btnSecondary(isDark) {
  const green = isDark ? "#3FCF9B" : "#1D9E75";
  return {
    padding: "9px 16px", borderRadius: 50, border: `1px solid ${green}`,
    background: "transparent", color: green,
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  };
}
function btnPrimary(isDark) {
  const green = isDark ? "#3FCF9B" : "#1D9E75";
  return {
    padding: "9px 20px", borderRadius: 50, border: "none",
    background: green, color: isDark ? "#06060A" : "#fff",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  };
}

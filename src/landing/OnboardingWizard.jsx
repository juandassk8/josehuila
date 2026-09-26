import { useEffect, useState } from "react";
import { DS } from "../lib/design.js";
import { AUTH_STYLES } from "./AuthLayout.jsx";
import { createOwnedCompany, getCurrentUser } from "./auth_db.js";
import { NICHES_LIST } from "../lib/niches.js";
import { logger } from "../lib/logger.js";

// Reusamos el accent azul único de la landing
const RED = "#4A8FE7";
const RED_DEEP = "#2E5F9A";
const STEPS_COUNT = 3;

// Wizard de 3 pasos post-signup. Crea la empresa al final.
//   1. Nombre empresa
//   2. Nicho de industria
//   3. KPIs y objetivos del negocio (ROAS, costo/compra, facturación,
//      benchmarks del embudo) — los mismos campos que el form admin para
//      crear un cliente.
export function OnboardingWizard({ onComplete }) {
  const [user, setUser] = useState(null);
  // Si el SignupPage pre-pobló empresa en sessionStorage, saltamos el step 1.
  const prefilledCompany = (typeof sessionStorage !== "undefined" ? sessionStorage.getItem("signup_company") : "") || "";
  const [step, setStep] = useState(prefilledCompany ? 2 : 1);
  const [name, setName] = useState(prefilledCompany);
  const [niche, setNiche] = useState("");

  // Step 3 — full objectives matching admin form. Todo opcional.
  const [obj, setObj] = useState({
    roasMin: "",
    roasTarget: "",
    costPerPurchaseMax: "",
    costPerPurchaseTarget: "",
    revenueActual: "",
    revenueTarget: "",
    cpm: "",
    cpcTarget: "",
    ctrTarget: "",
    pageLoadMin: "",
    checkoutRateTarget: "",
    costPerInitiatedTarget: "",
    checkoutConversionTarget: "",
  });
  const setObjField = (key, val) => setObj((o) => ({ ...o, [key]: val }));
  const [showBenchmarks, setShowBenchmarks] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const u = await getCurrentUser();
      if (cancelled) return;
      if (!u) {
        // No autenticado — redirect al signup.
        window.location.assign("/signup");
        return;
      }
      setUser(u);
    })();
    return () => { cancelled = true; };
  }, []);

  const goNext = () => {
    setError("");
    if (step === 1 && !name.trim()) { setError("Ingresá el nombre de tu empresa."); return; }
    if (step === 2 && !niche.trim()) { setError("Elegí o escribí un nicho."); return; }
    if (step < STEPS_COUNT) { setStep(step + 1); return; }
    finish();
  };

  const goBack = () => { setError(""); setStep((s) => Math.max(1, s - 1)); };

  const finish = async () => {
    setError("");
    if (!user?.id) return;
    setBusy(true);
    try {
      // Convertimos strings a números, descartando vacíos.
      const objectives = Object.fromEntries(
        Object.entries(obj)
          .map(([k, v]) => [k, parseFloat(v)])
          .filter(([, v]) => Number.isFinite(v))
      );
      const { company } = await createOwnedCompany({
        user, companyName: name, niche,
        // El backend guarda esto en companies.objectives — el campo legacy
        // que el resto de la app (reportes, benchmarks, calcMetrics) ya lee.
        objectives,
      });
      // Limpiar datos de signup que ya usamos.
      try {
        sessionStorage.removeItem("signup_name");
        sessionStorage.removeItem("signup_company");
      } catch { /* ignore */ }
      onComplete?.(company);
    } catch (e) {
      logger.error("[OnboardingWizard] failed", e);
      setError(e?.message || "No se pudo crear el workspace.");
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `radial-gradient(circle at 50% 20%, ${RED}14, transparent 50%), #06060A`,
      color: "#fff", fontFamily: DS.font,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        width: "min(520px, 100%)",
        background: "#0B0B11",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "32px 36px 28px",
        boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
      }}>
        {/* Progress dots */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 6, marginBottom: 20,
        }}>
          {Array.from({ length: STEPS_COUNT }).map((_, i) => (
            <span key={i} style={{
              height: 6, width: i + 1 === step ? 28 : 6,
              borderRadius: 50,
              background: i + 1 <= step
                ? `linear-gradient(90deg, ${RED}, ${RED_DEEP})`
                : "rgba(255,255,255,0.12)",
              transition: "width 200ms ease, background 200ms ease",
            }} />
          ))}
        </div>

        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
          color: RED, textTransform: "uppercase", marginBottom: 6,
          textAlign: "center",
        }}>
          PASO {step} DE {STEPS_COUNT}
        </div>

        {step === 1 && <Step1 name={name} setName={setName} />}
        {step === 2 && <Step2 niche={niche} setNiche={setNiche} />}
        {step === 3 && <Step3
          obj={obj} setObjField={setObjField}
          showBenchmarks={showBenchmarks} setShowBenchmarks={setShowBenchmarks}
        />}

        {error && <div style={{ ...AUTH_STYLES.errorBox, marginTop: 14 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {step > 1 && (
            <button
              onClick={goBack} disabled={busy}
              style={{
                padding: "12px 18px", borderRadius: 50,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent", color: "rgba(255,255,255,0.75)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
              }}
            >← Atrás</button>
          )}
          <button
            onClick={goNext} disabled={busy}
            style={{
              flex: 1, padding: "12px 22px", borderRadius: 50, border: "none",
              background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
              color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.02em",
              boxShadow: `0 8px 24px ${RED}55`,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? "Creando workspace…"
                  : step === STEPS_COUNT ? "Crear mi workspace →" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step1({ name, setName }) {
  return (
    <>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" }}>
        ¿Cómo se llama tu empresa?
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 22px", textAlign: "center" }}>
        Vamos a usar este nombre para crear tu workspace.
      </p>
      <input
        autoFocus
        value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Ej: Wakeup, Naraa, Peluna Pets…"
        style={{ ...AUTH_STYLES.input, fontSize: 17, padding: "14px 16px" }}
      />
    </>
  );
}

function Step2({ niche, setNiche }) {
  return (
    <>
      <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" }}>
        ¿En qué industria operás?
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 18px", textAlign: "center" }}>
        El Guionista IA va a usar esto para hacerte preguntas específicas de tu nicho.
      </p>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        maxHeight: "44vh", overflowY: "auto", paddingRight: 4,
      }}>
        {NICHES_LIST.map((n) => {
          const active = niche === n.key;
          return (
            <button
              key={n.key} type="button"
              onClick={() => setNiche(n.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "11px 12px", borderRadius: 10,
                border: active ? `1.5px solid ${n.color}` : "1px solid rgba(255,255,255,0.10)",
                background: active ? `${n.color}1F` : "rgba(255,255,255,0.02)",
                color: "#fff",
                fontSize: 12.5, fontWeight: active ? 700 : 600,
                cursor: "pointer", fontFamily: DS.font,
                textAlign: "left", lineHeight: 1.25,
                transition: "background 120ms",
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 7,
                background: `${n.color}26`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>{n.emoji}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function Step3({ obj, setObjField, showBenchmarks, setShowBenchmarks }) {
  const f = (label, key, placeholder, prefix, suffix) => (
    <KpiInput
      label={label}
      placeholder={placeholder}
      value={obj[key]}
      onChange={(v) => setObjField(key, v)}
      prefix={prefix} suffix={suffix}
    />
  );

  return (
    <div style={{ maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px", textAlign: "center" }}>
        Objetivos del negocio
      </h2>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 22px", textAlign: "center" }}>
        Todo es opcional. Te sirve para evaluar performance contra tus benchmarks. Podés cambiarlo después.
      </p>

      <Section title="ROAS">
        <Grid2>
          {f("ROAS mínimo (break-even)",  "roasMin",    "ej. 3")}
          {f("ROAS objetivo",             "roasTarget", "ej. 5", null, "×")}
        </Grid2>
      </Section>

      <Section title="Costo por compra (COP)">
        <Grid2>
          {f("Máximo",  "costPerPurchaseMax",    "ej. 35.000",  "$")}
          {f("Objetivo","costPerPurchaseTarget", "ej. 18.000",  "$")}
        </Grid2>
      </Section>

      <Section title="Facturación mensual (COP)">
        <Grid2>
          {f("Facturación actual",  "revenueActual", "ej. 100.000.000", "$")}
          {f("Facturación objetivo","revenueTarget", "ej. 500.000.000", "$")}
        </Grid2>
      </Section>

      {/* Benchmarks colapsable */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: "14px 16px", marginTop: 6,
      }}>
        <button
          type="button"
          onClick={() => setShowBenchmarks((v) => !v)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            fontFamily: DS.font, color: "#fff",
          }}
        >
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
              Benchmarks del embudo <span style={{ color: "rgba(255,255,255,0.4)", textTransform: "none", fontWeight: 500, letterSpacing: 0 }}>(opcional)</span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              CPM, CPC, CTR + métricas de checkout
            </div>
          </div>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 16, transform: showBenchmarks ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
        </button>

        {showBenchmarks && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 10 }}>Tráfico</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
              {f("CPM objetivo",      "cpm",       "ej. 12.000", "$")}
              {f("CPC objetivo",      "cpcTarget", "ej. 600",    "$")}
              {f("CTR objetivo (%)",  "ctrTarget", "ej. 2",      null, "%")}
            </div>

            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 10 }}>Conversión de página</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {f("% carga mínimo",            "pageLoadMin",              "ej. 80",     null, "%")}
              {f("% checkout objetivo",       "checkoutRateTarget",       "ej. 15",     null, "%")}
              {f("Costo/pago inic. objetivo", "costPerInitiatedTarget",   "ej. 10.000", "$")}
              {f("% conv. checkout",          "checkoutConversionTarget", "ej. 20",     null, "%")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.7)",
        marginBottom: 8,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Grid2({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {children}
    </div>
  );
}

function KpiInput({ label, value, onChange, placeholder, prefix, suffix }) {
  return (
    <div>
      <label style={AUTH_STYLES.inputLabel}>{label}</label>
      <div style={{ position: "relative" }}>
        {prefix && (
          <span style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: "rgba(255,255,255,0.5)", pointerEvents: "none",
          }}>{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          step="0.1"
          style={{
            ...AUTH_STYLES.input,
            paddingLeft: prefix ? 22 : 14,
            paddingRight: suffix ? 28 : 14,
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
            fontSize: 14, color: "rgba(255,255,255,0.5)", pointerEvents: "none",
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

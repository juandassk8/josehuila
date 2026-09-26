import { useState } from "react";
import { DS, darkBtn, darkBtnGhost, darkBtnRed, darkInput } from "../../lib/design.js";
import { isoDate } from "../../lib/weeks.js";
import { getCompanyTrackingContext } from "../data/trackingDb.js";

const DAY_LABELS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function PerformanceReportModal({
  report,         // existing or null
  date,           // Date of the grid cell
  type,           // 'am_10' | 'pm_3'
  company,        // full company object (for autofill)
  companyName,
  currentMember,
  defaultOwnerId,
  onSave,
  onDelete,
  onClose,
}) {
  const isAM = type === "am_10";
  const initial = report || {};

  const defaultDataDate = (() => {
    const d = new Date(date);
    if (isAM) d.setDate(d.getDate() - 1);
    return isoDate(d);
  })();

  const [convVal, setConvVal] = useState(initial.conversion_value ?? "");
  const [convTarget, setConvTarget] = useState(initial.conversion_value_target ?? "");
  const [spend, setSpend] = useState(initial.spend ?? "");
  const [cpp, setCpp] = useState(initial.cost_per_purchase ?? "");
  const [cppTarget, setCppTarget] = useState(initial.cost_per_purchase_target ?? "");
  const [roas, setRoas] = useState(initial.roas ?? "");
  const [roasTarget, setRoasTarget] = useState(initial.roas_target ?? "");
  const [analysis, setAnalysis] = useState(initial.analysis || "");
  const [recommendations, setRecommendations] = useState(initial.recommendations || "");
  const [pdfSent, setPdfSent] = useState(!!initial.pdf_sent);
  const [whatsappSent, setWhatsappSent] = useState(!!initial.whatsapp_sent);
  const [markSent, setMarkSent] = useState(!!initial.sent_at);
  const [loadingAutofill, setLoadingAutofill] = useState(false);
  const [autofillMsg, setAutofillMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const toNum = (v) => (v === "" || v == null ? null : Number(v));

  const handleAutofill = async () => {
    if (!company?.id) return;
    setLoadingAutofill(true);
    setAutofillMsg("");
    try {
      const { company: c, recentReports } = await getCompanyTrackingContext(company.id);
      const obj = c?.objectives || {};
      // Objetivos siempre se rellenan desde la empresa
      if (obj.revenueTarget) {
        // Daily target = monthly / 30 (aprox)
        const dailyConvTarget = Number(obj.revenueTarget) / 30;
        if (dailyConvTarget) setConvTarget(Math.round(dailyConvTarget));
      }
      if (obj.costPerPurchaseTarget) setCppTarget(Number(obj.costPerPurchaseTarget));
      if (obj.roasTarget) setRoasTarget(Number(obj.roasTarget));

      // Datos reales: último reporte
      const latest = recentReports?.[0];
      if (latest?.data) {
        const d = latest.data;
        if (d.valor_conversion != null) setConvVal(d.valor_conversion);
        if (d.spend != null) setSpend(d.spend);
        if (d.spend && d.purchases) setCpp(Math.round(d.spend / d.purchases));
        if (d.roas != null) setRoas(d.roas);
        else if (d.spend && d.valor_conversion) setRoas((d.valor_conversion / d.spend).toFixed(2));
        setAutofillMsg(`✓ Cargado del reporte del ${latest.period || new Date(latest.created_at).toLocaleDateString("es-CO")}`);
      } else {
        setAutofillMsg(obj.revenueTarget || obj.roasTarget || obj.costPerPurchaseTarget
          ? "✓ Metas cargadas (no hay reportes de datos reales aún)"
          : "⚠ La empresa no tiene reportes ni objetivos configurados");
      }
    } catch (e) {
      setAutofillMsg(`⚠ Error: ${e.message || "no se pudo cargar"}`);
    } finally {
      setLoadingAutofill(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      company_id: initial.company_id,
      report_date: initial.report_date || isoDate(date),
      report_type: type,
      data_date: initial.data_date || defaultDataDate,
      conversion_value: toNum(convVal),
      conversion_value_target: toNum(convTarget),
      spend: toNum(spend),
      cost_per_purchase: toNum(cpp),
      cost_per_purchase_target: toNum(cppTarget),
      roas: toNum(roas),
      roas_target: toNum(roasTarget),
      analysis: analysis || null,
      recommendations: recommendations || null,
      pdf_sent: isAM ? pdfSent : false,
      whatsapp_sent: whatsappSent,
      owner_id: initial.owner_id || defaultOwnerId || currentMember?.id || null,
      sent_at: markSent ? (initial.sent_at || new Date().toISOString()) : null,
    };
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      setSaveError(err?.message || "No se pudo guardar el reporte. Probá de nuevo.");
      setSaving(false);
    }
  };

  const dayOfWeek = (date.getDay() + 6) % 7;
  const dayLabel = DAY_LABELS[dayOfWeek] || "";

  // CPP color: verde si <= target, naranja si 20% over, rojo si más.
  const cppColor = (() => {
    const v = toNum(cpp);
    const t = toNum(cppTarget);
    if (v == null || t == null || t === 0) return DS.textHint;
    if (v <= t) return DS.green;
    if (v <= t * 1.2) return DS.amber;
    return DS.red;
  })();

  const roasColor = (() => {
    const v = toNum(roas);
    const t = toNum(roasTarget);
    if (v == null || t == null || t === 0) return DS.textHint;
    if (v >= t) return DS.green;
    if (v >= t * 0.85) return DS.amber;
    return DS.red;
  })();

  const panelStyle = {
    background: DS.bg,
    border: DS.border,
    borderRadius: 14,
    padding: 22,
    fontFamily: DS.font,
    color: DS.textPrimary,
    maxHeight: "90vh",
    overflowY: "auto",
    boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
  };

  return (
    <Backdrop onClose={onClose}>
      <form onSubmit={handleSubmit} style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.16em", textTransform: "uppercase" }}>
              {companyName} · {dayLabel}
            </div>
            <div style={{ fontSize: 16, color: DS.textPrimary, fontWeight: 700 }}>
              {isAM ? "📈 Reporte 10 AM" : "📊 Reporte 3 PM"}
              <span style={{ color: DS.textMuted, fontSize: 12, fontWeight: 500, marginLeft: 10 }}>
                Datos de {isAM ? "ayer" : "hoy hasta 3pm"}: {defaultDataDate}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAutofill}
            disabled={loadingAutofill || !company?.id}
            style={{
              ...darkBtnGhost,
              padding: "6px 14px",
              fontSize: 11,
              whiteSpace: "nowrap",
              opacity: loadingAutofill ? 0.5 : 1,
            }}
            title="Autocompletar desde reportes y objetivos de la empresa"
          >
            {loadingAutofill ? "Cargando…" : "⚡ Autocompletar"}
          </button>
        </div>

        {autofillMsg && (
          <div style={{ fontSize: 11, color: DS.textSecondary, marginBottom: 12, padding: "6px 10px", background: DS.bgCard, border: DS.border, borderRadius: 8 }}>
            {autofillMsg}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <NumField label="Valor conversión" value={convVal} onChange={setConvVal} placeholder="3800000" />
          <NumField label="Meta valor conversión" value={convTarget} onChange={setConvTarget} placeholder="4000000" />
          <NumField label="Gasto total" value={spend} onChange={setSpend} placeholder="2800000" fullWidth />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <NumField label="Costo por compra" value={cpp} onChange={setCpp} placeholder="50000" accent={cppColor} />
          <NumField label="Meta costo / compra" value={cppTarget} onChange={setCppTarget} placeholder="50000" />
          <NumField label="ROAS" value={roas} onChange={setRoas} placeholder="2.1" step="0.01" accent={roasColor} />
          <NumField label="Meta ROAS" value={roasTarget} onChange={setRoasTarget} placeholder="2.5" step="0.01" />
        </div>

        <Field label="Análisis">
          <textarea
            value={analysis}
            onChange={(e) => setAnalysis(e.target.value)}
            rows={3}
            placeholder="Qué pasó, qué rompió, qué falló…"
            style={{ ...darkInput, padding: "9px 12px", resize: "vertical", fontFamily: DS.font }}
          />
        </Field>

        <Field label="Recomendaciones">
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            rows={3}
            placeholder="Qué hacer mañana / próximos pasos…"
            style={{ ...darkInput, padding: "9px 12px", resize: "vertical", fontFamily: DS.font }}
          />
        </Field>

        <Field label="Envíos">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {isAM && (
              <CheckboxRow checked={pdfSent} onChange={setPdfSent} label="PDF Report enviado" />
            )}
            <CheckboxRow
              checked={whatsappSent}
              onChange={setWhatsappSent}
              label={isAM ? "WhatsApp enviado" : "WhatsApp update enviado"}
            />
            <CheckboxRow
              checked={markSent}
              onChange={setMarkSent}
              label="Marcar reporte como enviado (a tiempo)"
            />
          </div>
        </Field>

        {saveError && (
          <div style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(226,75,74,0.12)", border: "1px solid rgba(226,75,74,0.3)",
            color: "#E24B4A", fontSize: 12, fontWeight: 600, lineHeight: 1.45,
          }}>
            ⚠ {saveError}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "space-between" }}>
          <div>
            {report?.id && (
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  if (saving) return;
                  if (!confirm("¿Eliminar este reporte? No se puede deshacer.")) return;
                  setSaving(true); setSaveError(null);
                  try { await onDelete?.(report.id); onClose(); }
                  catch (err) {
                    setSaveError(err?.message || "No se pudo eliminar.");
                    setSaving(false);
                  }
                }}
                style={{ ...darkBtnRed, opacity: saving ? 0.5 : 1 }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={saving} onClick={onClose} style={{ ...darkBtnGhost, opacity: saving ? 0.5 : 1 }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...darkBtn, opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </Backdrop>
  );
}

function NumField({ label, value, onChange, placeholder, step, accent, fullWidth }) {
  return (
    <div style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step || "any"}
        style={{
          ...darkInput,
          padding: "9px 12px",
          ...(accent ? { borderColor: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : {}),
        }}
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function CheckboxRow({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: DS.textSecondary, fontSize: 12 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Backdrop({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 680 }}>
        {children}
      </div>
    </div>
  );
}

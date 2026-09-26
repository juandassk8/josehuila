import { useState, useEffect } from "react";
import { DS, darkCard, darkInput, darkBtn } from "../../lib/design.js";
import { useVoiceProfile } from "./hooks/useVoiceProfile.js";
import { updateVoiceProfile } from "./workspace_guiones_db.js";
import { useCompanyId } from "./context.js";
import { ExpertiseDocuments } from "./ExpertiseDocuments.jsx";

export function VoiceExpertisePanel() {
  const companyId = useCompanyId();
  const { voice, loading, reload } = useVoiceProfile();

  const [vPatterns, setVPatterns] = useState("");
  const [vPhrases, setVPhrases] = useState("");
  const [vMustSay, setVMustSay] = useState("");
  const [vNeverSay, setVNeverSay] = useState("");
  const [vAccFeedback, setVAccFeedback] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (voice) {
      setVPatterns(voice.patterns || "");
      setVPhrases(voice.phrases || "");
      setVMustSay(voice.must_say || "");
      setVNeverSay(voice.never_say || "");
      setVAccFeedback(voice.accumulated_feedback || "");
    }
  }, [voice]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await updateVoiceProfile(companyId, {
      patterns: vPatterns,
      phrases: vPhrases,
      must_say: vMustSay,
      never_say: vNeverSay,
      accumulated_feedback: vAccFeedback,
    });
    reload();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ color: DS.textMuted, fontSize: 12, padding: "40px 0", textAlign: "center" }}>
        Cargando perfil...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720 }}>
      {/* Reglas IA — la sección crítica que el LLM siempre respeta */}
      <div style={darkCard}>
        <SectionHeader
          title="REGLAS PARA LA IA"
          subtitle="Estas reglas se inyectan en cada guion que la IA genera para esta empresa. También se pueden agregar desde el botón 'Ajustar con IA' al editar un guion."
        />

        <Field
          label="✅ Obligatorio mencionar (siempre, en cada guion)"
          value={vMustSay}
          onChange={setVMustSay}
          placeholder='Ej: "Mencionar siempre la garantía de 30 días" · "Cerrar con CTA a DM" (una por línea)'
          rows={3}
        />
        <Field
          label="🚫 Prohibido decir"
          value={vNeverSay}
          onChange={setVNeverSay}
          placeholder='Ej: "Nunca usar la palabra premium" · "No mencionar competencia X" · "Evitar términos médicos" (una por línea)'
          rows={3}
        />
        <Field
          label="🧠 Recomendaciones aprendidas (auto-acumulado)"
          value={vAccFeedback}
          onChange={setVAccFeedback}
          placeholder="Aquí se acumulan las reglas que guardás desde 'Ajustar con IA' como Recomendación. Podés editar o borrar líneas a mano."
          rows={5}
        />
      </div>

      {/* Voice Profile — manual notes (voz, no reglas) */}
      <div style={darkCard}>
        <SectionHeader
          title="PERFIL DE VOZ (MANUAL)"
          subtitle="Notas adicionales sobre tu voz. La voz principal se aprende automáticamente de tus referencias propias en cada formato."
        />

        <Field
          label="Patrones de habla adicionales"
          value={vPatterns}
          onChange={setVPatterns}
          placeholder="Notas extra sobre como hablas que no se capturan en los ejemplos..."
          rows={3}
        />
        <Field
          label="Frases que usas frecuentemente"
          value={vPhrases}
          onChange={setVPhrases}
          placeholder="Frases que usas frecuentemente (una por linea)..."
          rows={2}
        />
      </div>

      {/* Footer común — guarda reglas IA + perfil de voz en un solo upsert */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ ...darkBtn, padding: "8px 18px", fontSize: 12, opacity: saving ? 0.5 : 1 }}
        >
          {saving ? "Guardando..." : "Guardar reglas y voz"}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: DS.green, fontWeight: 600 }}>
            Guardado
          </span>
        )}
      </div>

      {/* Expertise Documents — new system */}
      <ExpertiseDocuments />
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: DS.textMuted,
          letterSpacing: "0.14em",
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>{subtitle}</div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 700,
          color: DS.textMuted,
          letterSpacing: "0.12em",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ ...darkInput, resize: "vertical", lineHeight: 1.6 }}
      />
    </div>
  );
}

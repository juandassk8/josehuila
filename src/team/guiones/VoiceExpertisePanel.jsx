import { useState, useEffect } from "react";
import { DS, darkCard, darkInput, darkBtn } from "../../lib/design.js";
import { useVoiceProfile } from "../hooks/useVoiceProfile.js";
import { updateVoiceProfile } from "../data/guionesDb.js";
import { ExpertiseDocuments } from "./ExpertiseDocuments.jsx";

export function VoiceExpertisePanel() {
  const { voice, loading, reload } = useVoiceProfile();

  const [vPatterns, setVPatterns] = useState("");
  const [vPhrases, setVPhrases] = useState("");
  const [vNeverSay, setVNeverSay] = useState("");
  const [vAccFeedback, setVAccFeedback] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (voice) {
      setVPatterns(voice.patterns || "");
      setVPhrases(voice.phrases || "");
      setVNeverSay(voice.never_say || "");
      setVAccFeedback(voice.accumulated_feedback || "");
    }
  }, [voice]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await updateVoiceProfile({
      patterns: vPatterns,
      phrases: vPhrases,
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
      {/* Voice Profile — simplified */}
      <div style={darkCard}>
        <SectionHeader
          title="PERFIL DE VOZ (MANUAL)"
          subtitle="Notas adicionales sobre tu voz. La voz principal se aprende automaticamente de tus referencias propias en cada formato."
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
        <Field
          label="Lo que NUNCA dices"
          value={vNeverSay}
          onChange={setVNeverSay}
          placeholder="Palabras, frases o estilos que evitas..."
          rows={2}
        />
        <Field
          label="🧠 Memoria de feedbacks (auto-aprendido)"
          value={vAccFeedback}
          onChange={setVAccFeedback}
          placeholder="Aqui se acumulan los feedbacks que guardas desde 'Ajustar con IA'. Puedes editar o borrar lineas manualmente."
          rows={6}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ ...darkBtn, padding: "8px 18px", fontSize: 12, opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Guardando..." : "Guardar voz"}
          </button>
          {saved && (
            <span style={{ fontSize: 12, color: DS.green, fontWeight: 600 }}>
              Guardado
            </span>
          )}
        </div>
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

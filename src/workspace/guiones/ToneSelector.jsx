import { DS } from "../../lib/design.js";

// Selector de tono del guion. 3 opciones: Natural / Neutral / Profesional.
// La AI recibe instrucciones específicas según el tono elegido.

export const TONES = [
  {
    key: "natural",
    label: "Natural",
    emoji: "💛",
    short: "Cercano y descomplicado",
    description: "Colombiano relajado. Voseo o tuteo según audiencia. Frases cortas, contracciones, gender-aware (parce/amiga).",
  },
  {
    key: "neutral",
    label: "Neutral",
    emoji: "🌍",
    short: "Universal LATAM",
    description: "Español neutro. Tú estándar. Cercano pero sin slang regional. Funciona en LATAM completo.",
  },
  {
    key: "professional",
    label: "Profesional",
    emoji: "💼",
    short: "Confiable y formal",
    description: "Autoridad y confianza. Sin slang ni contracciones. Apto para B2B, salud, finanzas, alto ticket.",
  },
];

export function ToneSelector({ value, onChange }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: DS.textSecondary,
        letterSpacing: "0.06em", marginBottom: 8,
      }}>
        TONO DEL GUION
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {TONES.map((t) => {
          const active = value === t.key;
          return (
            <button
              key={t.key} type="button"
              onClick={() => onChange(t.key)}
              title={t.description}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 50,
                border: active ? `1.5px solid ${DS.textPrimary}` : `1px solid ${DS.textHint}`,
                background: active ? "rgba(255,255,255,0.06)" : "transparent",
                color: active ? DS.textPrimary : DS.textSecondary,
                fontSize: 11, fontWeight: active ? 700 : 600, cursor: "pointer",
                fontFamily: DS.font, lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: 11 }}>{t.emoji}</span>
              <span>{t.label}</span>
              <span style={{
                fontSize: 9.5, fontWeight: 500,
                color: active ? DS.textSecondary : DS.textMuted,
                marginLeft: 1,
              }}>· {t.short}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

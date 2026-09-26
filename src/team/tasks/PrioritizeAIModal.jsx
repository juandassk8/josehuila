import { useState } from "react";
import { DS, PRIORITY_COLORS, PRIORITY_LABEL } from "../../lib/design.js";
import { AudioUpload } from "../guiones/AudioUpload.jsx";
import { FlagIcon } from "./PriorityDropdown.jsx";
import { updateTask } from "../data/db.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";

const PRIORITY_ORDER = { urgente: 0, alta: 1, normal: 2, baja: 3 };

export function PrioritizeAIModal({ tasks, members, spaces, companies, onClose }) {
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(null); // [{ task_id, new_priority, reason }]
  const [rejected, setRejected] = useState({}); // { task_id: true }
  const [applying, setApplying] = useState(false);

  const onTranscribed = (text) => {
    setContext((prev) => (prev ? `${prev}\n\n${text}` : text));
  };

  const runAI = async () => {
    if (!tasks || tasks.length === 0) {
      setError("No tienes tareas pendientes.");
      return;
    }
    setError("");
    setLoading(true);
    setSuggestions(null);
    try {
      const tasksPayload = tasks.map((t) => {
        const space = spaces?.find((s) => s.id === t.space_id);
        const company = companies?.find((c) => c.id === t.company_id);
        return {
          id: t.id,
          titulo: t.title,
          descripcion: t.description || "",
          prioridad_actual: t.priority,
          estado: t.status,
          espacio: space?.name || null,
          empresa: company?.name || null,
          fecha_limite: t.due_date || null,
        };
      });

      const systemPrompt = `Eres el asistente ejecutivo de José Manuel Huila, fundador de Inforce Consulting (agencia de performance marketing + contenido).

Tu trabajo: re-priorizar sus tareas pendientes según el contexto que él te da. NO inventes tareas ni modifiques nada más — solo cambia la prioridad de las tareas existentes.

Niveles de prioridad válidos (solo estos 4):
- "urgente": bloqueante, hoy. Si no se hace, se daña algo grave (cliente molesto, reporte sin enviar, deadline del día).
- "alta": esta semana, importante para resultados del mes. Debe programarse pronto.
- "normal": proyecto sano, puede esperar unos días sin drama.
- "baja": nice-to-have, sin fecha crítica.

Reglas:
- Si la fecha_limite es hoy o vencida → mínimo "alta", probablemente "urgente".
- Si no hay contexto suficiente para decidir, mantén la prioridad actual.
- Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin explicación previa.

Formato exacto de respuesta:
{
  "suggestions": [
    { "task_id": "uuid", "new_priority": "urgente|alta|normal|baja", "reason": "explicación corta en español" }
  ]
}

Incluye SOLO las tareas cuya prioridad cambies. Si no cambias ninguna, devuelve { "suggestions": [] }.`;

      const userMsg = `Contexto de mi día (dicho por voz o texto):
${context || "(sin contexto adicional — priorizar solo por la data de las tareas)"}

Mis tareas pendientes:
${JSON.stringify(tasksPayload, null, 2)}

Re-prioriza lo que amerite según este contexto. Devuelve solo el JSON.`;

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({
          systemPrompt,
          messages: [{ role: "user", content: userMsg }],
          maxTokens: 2000,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text || "";

      // Extract JSON (tolerant of accidental markdown fences)
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("La IA no devolvió JSON válido.");
      const parsed = JSON.parse(match[0]);
      const arr = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];

      // Filter suggestions: must reference real task_id + valid priority + actually changes the priority
      const validIds = new Set(tasks.map((t) => t.id));
      const validPriorities = new Set(["urgente", "alta", "normal", "baja"]);
      const cleaned = arr
        .filter((s) => validIds.has(s.task_id) && validPriorities.has(s.new_priority))
        .filter((s) => {
          const original = tasks.find((t) => t.id === s.task_id);
          return original && original.priority !== s.new_priority;
        });

      if (cleaned.length === 0) {
        setError("La IA no sugirió cambios con el contexto actual. Intenta darle más detalles de tu día.");
      } else {
        setSuggestions(cleaned);
      }
    } catch (err) {
      logger.error(err);
      setError(err.message || "Error al llamar la IA.");
    } finally {
      setLoading(false);
    }
  };

  const applyAll = async () => {
    if (!suggestions) return;
    setApplying(true);
    try {
      for (const s of suggestions) {
        if (rejected[s.task_id]) continue;
        await updateTask(s.task_id, { priority: s.new_priority });
      }
      onClose?.();
    } catch (err) {
      setError(err.message || "Error al aplicar los cambios.");
    } finally {
      setApplying(false);
    }
  };

  const acceptedCount = suggestions ? suggestions.filter((s) => !rejected[s.task_id]).length : 0;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start",
        justifyContent: "center", padding: "60px 20px 40px", zIndex: 10000, fontFamily: DS.font,
      }}
    >
      <div style={{
        background: DS.bgSide, border: DS.border, borderRadius: 16,
        width: "100%", maxWidth: 680, boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
        color: DS.textPrimary, display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 100px)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 22px", borderBottom: DS.border,
        }}>
          <div>
            <div style={{ fontSize: 10, color: DS.purple, letterSpacing: "0.2em", fontWeight: 700 }}>
              PRIORIZAR CON IA
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 700, color: DS.textPrimary }}>
              Organiza tu día con Claude
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 18, padding: "4px 8px",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px", overflowY: "auto", flex: 1 }}>
          {!suggestions && (
            <>
              <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 10, lineHeight: 1.5 }}>
                Dale contexto de tu día. Por ejemplo: "Hoy tengo reunión con un cliente importante a las 3pm, necesito que el reporte de Wake Up quede antes. La edición de los guiones puede esperar hasta mañana."
              </div>

              <div style={{ marginBottom: 8 }}>
                <AudioUpload onTranscribed={onTranscribed} label="🎙️ Grabar o subir audio" />
              </div>

              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="…o escribe el contexto de tu día aquí"
                rows={5}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${DS.textHint}`,
                  background: "transparent", color: DS.textPrimary,
                  fontSize: 13, fontFamily: DS.font, resize: "vertical",
                  outline: "none", marginTop: 10,
                }}
              />

              <div style={{
                marginTop: 14, fontSize: 11, color: DS.textMuted, letterSpacing: "0.08em",
              }}>
                {tasks?.length || 0} TAREAS PENDIENTES SERÁN EVALUADAS
              </div>
            </>
          )}

          {suggestions && suggestions.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: DS.textSecondary, marginBottom: 14 }}>
                Claude propone {suggestions.length} cambio{suggestions.length === 1 ? "" : "s"} de prioridad. Revisa y aplica los que te parezcan:
              </div>
              {suggestions
                .slice()
                .sort((a, b) => (PRIORITY_ORDER[a.new_priority] ?? 9) - (PRIORITY_ORDER[b.new_priority] ?? 9))
                .map((s) => {
                  const task = tasks.find((t) => t.id === s.task_id);
                  if (!task) return null;
                  const fromColor = PRIORITY_COLORS[task.priority];
                  const toColor = PRIORITY_COLORS[s.new_priority];
                  const isRejected = !!rejected[s.task_id];
                  return (
                    <div
                      key={s.task_id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: DS.border,
                        background: DS.bgCard,
                        marginBottom: 10,
                        opacity: isRejected ? 0.4 : 1,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: DS.textPrimary, marginBottom: 6 }}>
                        {task.title}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                        <PriorityPill color={fromColor} label={PRIORITY_LABEL[task.priority]} muted />
                        <span style={{ color: DS.textMuted, fontSize: 11 }}>→</span>
                        <PriorityPill color={toColor} label={PRIORITY_LABEL[s.new_priority]} />
                        <div style={{ flex: 1 }} />
                        <button
                          onClick={() => setRejected((prev) => ({ ...prev, [s.task_id]: !prev[s.task_id] }))}
                          style={{
                            padding: "4px 10px", borderRadius: 50,
                            border: `1px solid ${DS.textHint}`,
                            background: isRejected ? DS.green + "18" : "transparent",
                            color: isRejected ? DS.green : DS.textMuted,
                            fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                          }}
                        >
                          {isRejected ? "Ignorar ✓" : "Ignorar"}
                        </button>
                      </div>
                      {s.reason && (
                        <div style={{ fontSize: 11, color: DS.textSecondary, lineHeight: 1.5, marginTop: 4 }}>
                          <span style={{ color: DS.textMuted }}>💡 </span>
                          {s.reason}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: "10px 12px",
              background: "rgba(226,75,74,0.1)",
              border: "1px solid rgba(226,75,74,0.3)",
              borderRadius: 8, color: DS.red, fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 22px", borderTop: DS.border,
        }}>
          <div style={{ fontSize: 11, color: DS.textMuted }}>
            {suggestions ? `${acceptedCount} cambio${acceptedCount === 1 ? "" : "s"} seleccionado${acceptedCount === 1 ? "" : "s"}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              disabled={loading || applying}
              style={{
                padding: "9px 18px", borderRadius: 8,
                border: DS.border, background: "transparent",
                color: DS.textSecondary, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: DS.font,
              }}
            >
              Cancelar
            </button>
            {!suggestions && (
              <button
                onClick={runAI}
                disabled={loading}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "none",
                  background: DS.purple, color: "#fff",
                  fontSize: 12, fontWeight: 700, fontFamily: DS.font,
                  cursor: loading ? "wait" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Analizando…" : "✨ Analizar con Claude"}
              </button>
            )}
            {suggestions && (
              <button
                onClick={applyAll}
                disabled={applying || acceptedCount === 0}
                style={{
                  padding: "9px 18px", borderRadius: 8, border: "none",
                  background: DS.green, color: "#fff",
                  fontSize: 12, fontWeight: 700, fontFamily: DS.font,
                  cursor: applying ? "wait" : "pointer",
                  opacity: applying || acceptedCount === 0 ? 0.5 : 1,
                }}
              >
                {applying ? "Aplicando…" : `Aplicar ${acceptedCount}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PriorityPill({ color, label, muted }) {
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        padding: "3px 9px", borderRadius: 50,
        color: muted ? DS.textMuted : color,
        background: muted ? "transparent" : `${color}22`,
        border: `1px solid ${muted ? DS.textHint : color + "40"}`,
        textTransform: "uppercase",
        display: "inline-flex", alignItems: "center", gap: 5,
        textDecoration: muted ? "line-through" : "none",
      }}
    >
      <FlagIcon color={muted ? DS.textMuted : color} size={9} />
      {label}
    </span>
  );
}

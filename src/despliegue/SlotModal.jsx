import { useEffect, useState } from "react";
import { PIPELINE_STATUSES, REVIEW_STATUSES, COLUMNS_WITH_REVIEW } from "./pipeline_db.js";
import { listVariationsForConcept } from "./db.js";
import { DS } from "../lib/design.js";
import { useTheme } from "../lib/theme.jsx";
import { resolveAdName } from "./ad_name.js";
import { UgcSelect } from "./UgcSelect.jsx";
import { useCompanyUgcs } from "./hooks/useCompanyUgcs.js";
import { useCompanyProducts } from "../workspace/guiones/hooks/useCompanyProducts.js";
import { canEditSlotField, canRateInCampaign } from "../workspace/permissions/slot_permissions.js";
import { ScriptDurationPill } from "../lib/ScriptDurationPill.jsx";
import { SlotAIAdjust } from "./SlotAIAdjust.jsx";
import { STRATEGY_SECTIONS } from "./StrategyModal.jsx";

// Aplana los touchpoints (config.touchpoints) del board en una lista de chips,
// cada uno con su tipo (color/emoji) para seleccionar en el slot.
function touchpointItems(tp) {
  if (!tp) return [];
  const out = [];
  for (const sec of STRATEGY_SECTIONS) {
    for (const it of (Array.isArray(tp[sec.key]) ? tp[sec.key] : [])) {
      if (it?.id && it?.title) out.push({ ...it, color: sec.color, emoji: sec.emoji, sectionLabel: sec.label });
    }
  }
  return out;
}

// Modal de edición de un slot — layout centrado full-page tipo editor de
// contenido. Campos con pills (Etapa/Formato/Status/Revisión), inputs inline
// estilo Notion, y editor de guión UNIFICADO al final (un solo textarea).

const STAGES = [
  { key: "tofu", label: "TOFU", color: "#1D9E75" },
  { key: "mofu", label: "MOFU", color: "#D4A93B" },
  { key: "bofu", label: "BOFU", color: "#E24B4A" },
];

const FORMATS = [
  { key: "video",  label: "🎬 Video", color: "#8B5CF6" },
  { key: "static", label: "🖼️ Estático", color: "#3B8BD4" },
];

const PERFORMANCE = [
  { key: "green",  label: "🟢 Positivo" },
  { key: "yellow", label: "🟡 Neutro" },
  { key: "red",    label: "🔴 Negativo" },
];

export function SlotModal({ slot, concepts, isAdmin, onClose, onUpdate, onDelete, simpleMode = false, companyId, currentMember = null, touchpoints = null }) {
  const { isDark } = useTheme();
  const T = DS;
  const [local, setLocal] = useState(slot);
  // AI Adjust del guión (texto plano). `prefill` precarga la instrucción
  // cuando el user viene desde el "Acortar con IA" del pill de duración.
  // `bodyKey` se incrementa al aplicar IA para forzar remount del textarea
  // (que usa defaultValue, no responde a cambios de local.script_body).
  const [showAIAdjust, setShowAIAdjust] = useState(false);
  const [aiPrefill, setAIPrefill] = useState("");
  const [bodyKey, setBodyKey] = useState(0);

  useEffect(() => { setLocal(slot); }, [slot]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Member efectivo para la matriz de permisos. Si entra Jose con isAdmin
  // global pero sin currentMember (legacy /admin/slug/pipeline), bypaseamos
  // todo. Si hay currentMember + isAdmin global, lo combinamos.
  const member = currentMember
    ? (isAdmin ? { ...currentMember, is_admin_global: true } : currentMember)
    : (isAdmin ? { is_admin_global: true } : null);

  // Helper: ¿puede editar este field? Si no hay member, todo bloqueado.
  const canEdit = (field) => canEditSlotField(member, slot, field);

  const patch = (field, value) => setLocal((prev) => ({ ...prev, [field]: value }));
  const commit = (field, value) => {
    if (value === slot[field]) return;
    onUpdate?.({ [field]: value });
  };

  const showReview = COLUMNS_WITH_REVIEW.includes(local.status);
  const stageInfo = STAGES.find((s) => s.key === local.stage) || STAGES[0];
  const availableConcepts = (concepts || []).filter(
    (c) => c.stage === local.stage && c.format === local.format
  );

  // Resolver UGC actual para armar la nomenclatura. Traemos todos los UGCs
  // de la empresa (ambos kinds) para mostrar el nombre del asignado.
  const { ugcs: allUgcs } = useCompanyUgcs(companyId, null);
  // Productos de la empresa para el dropdown (solo si hay 1+)
  const { products } = useCompanyProducts(companyId);
  const currentUgc = allUgcs.find((u) => u.id === local.ugc_id) || null;
  const currentConcept = (concepts || []).find((c) => c.id === local.concept_id) || null;
  const autoAdName = resolveAdName(local, currentUgc, currentConcept);
  const ugcKind = local.format === "static" ? "designer" : "ugc";

  // Guión unificado: si existe script_body lo usamos; si no, fallback a los
  // campos viejos concatenados (migración suave sin perder datos).
  const initialScript = (() => {
    if (local.script_body && local.script_body.trim()) return local.script_body;
    const parts = [];
    const hooks = hookFromHooks(local.script_hooks);
    if (hooks) parts.push(hooks);
    if (local.script_cta) parts.push(local.script_cta);
    if (local.script_notes) parts.push(local.script_notes);
    return parts.join("\n\n");
  })();

  return (
    <div
      style={{
        width: "100%", height: "100%", minHeight: "100vh",
        background: T.bg, overflowY: "auto",
        fontFamily: T.font,
      }}
    >
      <div
        style={{
          maxWidth: 840, margin: "0 auto", padding: "28px 40px 120px",
          color: T.textPrimary,
        }}
      >
        {/* Top bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 28,
        }}>
          <button onClick={onClose} style={ghostBtn()}>← Volver</button>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Borrar solo admin global / owner / PM (no copywriter ni editor). */}
            {(member?.is_admin_global || member?.is_owner || (member?.roles || []).includes("project_manager")) && (
              <button onClick={onDelete} style={trashBtn()} title="Eliminar slot">
                🗑
              </button>
            )}
            <button onClick={onClose} style={darkBtn()}>Guardar</button>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{
            width: 12, height: 12, borderRadius: "50%", background: stageInfo.color,
            flexShrink: 0,
          }} />
          <input
            type="text"
            value={local.title || ""}
            onChange={(e) => patch("title", e.target.value)}
            onBlur={(e) => commit("title", e.target.value)}
            placeholder="Sin título"
            disabled={!canEdit("title")}
            style={{
              flex: 1, padding: "4px 0", border: "none", background: "transparent",
              fontSize: 34, fontWeight: 800, color: T.textPrimary,
              fontFamily: "inherit", outline: "none",
              letterSpacing: "-0.02em",
            }}
          />
        </div>

        {/* Badge de nomenclatura auto (o override manual) */}
        {autoAdName && (
          <div style={{
            marginLeft: 24, marginBottom: 10,
            fontSize: 11.5, color: T.textMuted, fontFamily: T.font,
            letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums",
          }}>
            {autoAdName}
            {(local.ad_name || "").trim() && (
              <span style={{
                marginLeft: 8, fontSize: 9, fontWeight: 700,
                padding: "2px 7px", borderRadius: 50,
                background: "rgba(127,127,127,0.15)", color: T.textSecondary,
                letterSpacing: "0.06em",
              }}>MANUAL</span>
            )}
          </div>
        )}

        <div style={{ height: 1, background: T.textHint, margin: "20px 0 18px" }} />

        {/* Review status pill (solo cuando aplica) */}
        {showReview && (() => {
          const feedback = Array.isArray(local.review_feedback) ? local.review_feedback : [];
          // Último feedback del stage actual — para mostrar "Ver Loom" si aplica.
          const latestForStage = [...feedback]
            .filter((f) => f.stage === local.status)
            .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))[0];
          const latestLoom = latestForStage?.loom_url || null;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, marginRight: 2 }}>
                Revisión:
              </span>
              {Object.entries(REVIEW_STATUSES).map(([key, r]) => (
                <button
                  key={key}
                  onClick={() => { patch("review_status", key); onUpdate?.({ review_status: key }); }}
                  disabled={!canEdit("review_status")}
                  style={pill(local.review_status === key, r.color)}
                >
                  {r.icon} {r.label}
                </button>
              ))}
              {local.review_status === "changes_requested" && latestLoom && (
                <a
                  href={latestLoom}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 50,
                    border: "1px solid rgba(226,75,74,0.35)",
                    background: "rgba(226,75,74,0.10)",
                    color: "#E24B4A", textDecoration: "none",
                    fontSize: 11, fontWeight: 700,
                  }}
                  title={latestLoom}
                >
                  🎥 Ver Loom de revisión
                </a>
              )}
            </div>
          );
        })()}

        {/* Alerta si está en campaña sin concepto vinculado */}
        {local.status === "in_campaign" && !local.concept_id && isAdmin && (
          <div style={{
            marginBottom: 16, padding: "10px 14px", borderRadius: 10,
            background: "rgba(245,166,35,0.12)",
            border: "1px solid rgba(245,166,35,0.35)",
            color: T.textPrimary, fontSize: 12, lineHeight: 1.5,
          }}>
            ⚠️ <strong>Este slot está en campaña pero no tiene concepto asignado.</strong>
            {" "}Seleccioná un concepto abajo para que aparezca automáticamente como variación
            en el Despliegue Creativo.
          </div>
        )}

        {/* Fields grid (rows estilo Notion) */}
        {!simpleMode && (
        <Row icon="🎯" label="Etapa">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STAGES.map((s) => (
              <button
                key={s.key}
                onClick={() => { patch("stage", s.key); onUpdate?.({ stage: s.key }); }}
                disabled={!canEdit("stage")}
                style={pill(local.stage === s.key, s.color)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Row>
        )}

        {!simpleMode && (
        <Row icon="🎞️" label="Formato">
          <div style={{ display: "flex", gap: 6 }}>
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => { patch("format", f.key); onUpdate?.({ format: f.key }); }}
                disabled={!canEdit("format")}
                style={pill(local.format === f.key, f.color)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Row>
        )}

        <Row icon="💡" label="Concepto">
          <select
            value={local.concept_name || ""}
            onChange={(e) => {
              const cn = e.target.value;
              const c = availableConcepts.find((x) => x.name === cn);
              patch("concept_name", cn);
              onUpdate?.({ concept_name: cn, concept_id: c?.id || null });
            }}
            disabled={!canEdit("concept_name")}
            style={{
              ...selectStyle(),
              border: local.concept_id ? `1px solid ${T.textHint}` : `1.5px solid ${T.amber}88`,
            }}
          >
            <option value="">
              {availableConcepts.length === 0
                ? "No hay conceptos en esta etapa/formato…"
                : "Selecciona concepto…"}
            </option>
            {availableConcepts.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </Row>

        {/* Producto — solo aparece si la empresa tiene 1+ productos cargados.
            Auto-marca el producto al guionizar para que la IA filtre el
            contexto y no mezcle datos entre productos. Editable acá si se
            asignó mal. */}
        {products.length > 0 && (
          <Row icon="📦" label="Producto">
            <select
              value={local.product_id || ""}
              onChange={(e) => {
                const v = e.target.value || null;
                patch("product_id", v);
                onUpdate?.({ product_id: v });
              }}
              disabled={!canEdit("product_id") && !canEdit("concept_id")}
              style={selectStyle()}
            >
              <option value="">— Sin producto asignado —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name || "(sin nombre)"}</option>
              ))}
            </select>
          </Row>
        )}

        <Row
          icon={ugcKind === "designer" ? "🎨" : "🎭"}
          label={ugcKind === "designer" ? "Diseñador" : "UGC"}
        >
          <UgcSelect
            companyId={companyId}
            kind={ugcKind}
            value={local.ugc_id}
            onChange={(id) => { patch("ugc_id", id); onUpdate?.({ ugc_id: id }); }}
            isAdmin={canEdit("ugc_id")}
          />
        </Row>

        <Row icon="📐" label="Ángulo">
          <input
            type="text"
            value={local.angle || ""}
            onChange={(e) => patch("angle", e.target.value)}
            onBlur={(e) => commit("angle", e.target.value)}
            placeholder="Ahorro de tiempo, estatus, miedo al fracaso…"
            disabled={!canEdit("angle")}
            style={inlineInput()}
          />
        </Row>

        {(() => {
          const tpItems = touchpointItems(touchpoints);
          if (tpItems.length === 0) return null;
          const selected = Array.isArray(local.touchpoints) ? local.touchpoints : [];
          const editable = canEdit("touchpoints");
          const toggle = (id) => {
            const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
            patch("touchpoints", next); commit("touchpoints", next);
          };
          return (
            <Row icon="🎯" label="Puntos de contacto">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {tpItems.map((it) => {
                  const on = selected.includes(it.id);
                  return (
                    <button key={it.id} onClick={() => editable && toggle(it.id)} disabled={!editable}
                      title={it.sectionLabel + (it.desc ? ` · ${it.desc}` : "")}
                      style={{
                        padding: "4px 10px", borderRadius: 50, fontSize: 11, fontWeight: 700, cursor: editable ? "pointer" : "default",
                        fontFamily: "inherit", border: `1px solid ${on ? it.color : T.textHint}`,
                        background: on ? `${it.color}22` : "transparent", color: on ? it.color : T.textMuted,
                        opacity: !editable && !on ? 0.5 : 1,
                      }}>
                      {it.emoji} {it.title}
                    </button>
                  );
                })}
              </div>
            </Row>
          );
        })()}

        <Row icon="🔗" label="Referencia">
          <input
            type="url"
            value={local.reference_url || ""}
            onChange={(e) => patch("reference_url", e.target.value)}
            onBlur={(e) => commit("reference_url", e.target.value)}
            placeholder="https://instagram.com/reel/..."
            disabled={!canEdit("reference_url")}
            style={inlineInput()}
          />
        </Row>

        <Row icon="🎥" label="Link loom">
          <input
            type="url"
            value={local.loom_review_url || ""}
            onChange={(e) => patch("loom_review_url", e.target.value)}
            onBlur={(e) => commit("loom_review_url", e.target.value)}
            placeholder="https://loom.com/..."
            disabled={!canEdit("loom_review_url")}
            style={inlineInput()}
          />
        </Row>

        <Row icon="📁" label="Contenido en crudo">
          <input
            type="url"
            value={local.raw_content_url || ""}
            onChange={(e) => patch("raw_content_url", e.target.value)}
            onBlur={(e) => commit("raw_content_url", e.target.value)}
            placeholder="Carpeta Drive del contenido en crudo"
            disabled={!canEdit("raw_content_url")}
            style={inlineInput()}
          />
        </Row>

        <Row icon="✂️" label="Video editado">
          <input
            type="url"
            value={local.edited_content_url || ""}
            onChange={(e) => patch("edited_content_url", e.target.value)}
            onBlur={(e) => commit("edited_content_url", e.target.value)}
            placeholder="Carpeta Drive del contenido editado"
            disabled={!canEdit("edited_content_url")}
            style={inlineInput()}
          />
        </Row>

        {!simpleMode && (
        <Row icon="🏷️" label="Nombre anuncio">
          <input
            type="text"
            value={local.ad_name || ""}
            onChange={(e) => patch("ad_name", e.target.value)}
            onBlur={(e) => commit("ad_name", e.target.value)}
            placeholder="Ej. BH_TOFU_Curiosidad_01"
            disabled={!canEdit("ad_name")}
            style={inlineInput()}
          />
        </Row>
        )}

        <Row icon="✂️" label="Fecha edición">
          <input
            type="date"
            value={local.edition_date || ""}
            onChange={(e) => patch("edition_date", e.target.value)}
            onBlur={(e) => commit("edition_date", e.target.value || null)}
            disabled={!canEdit("edition_date")}
            style={{ ...inlineInput(), maxWidth: 180 }}
          />
        </Row>

        {!simpleMode && (
        <Row icon="📤" label="Fecha publicación">
          <input
            type="date"
            value={local.publication_date || ""}
            onChange={(e) => patch("publication_date", e.target.value)}
            onBlur={(e) => commit("publication_date", e.target.value || null)}
            disabled={!canEdit("publication_date")}
            style={{ ...inlineInput(), maxWidth: 180 }}
          />
        </Row>
        )}

        {!simpleMode && (
        <Row icon="🔄" label="Status">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PIPELINE_STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => { patch("status", s.key); onUpdate?.({ status: s.key }); }}
                disabled={!canEdit("status")}
                style={pill(local.status === s.key, s.color)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Row>
        )}

        <Row icon="👤" label="Editor">
          <input
            type="text"
            value={local.editor_id || ""}
            onChange={(e) => patch("editor_id", e.target.value)}
            onBlur={(e) => commit("editor_id", e.target.value)}
            placeholder="Sin asignar"
            disabled={!canEdit("editor_id")}
            style={inlineInput()}
          />
        </Row>

        {/* Performance solo en feedback */}
        {local.status === "feedback" && (
          <>
            <Row icon="📊" label="Rendimiento">
              <div style={{ display: "flex", gap: 6 }}>
                {PERFORMANCE.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      patch("performance", p.key);
                      onUpdate?.({ performance: p.key, performance_marked_at: new Date().toISOString() });
                    }}
                    disabled={!canEdit("performance")}
                    style={pill(local.performance === p.key, "#3A3D3C")}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </Row>

            <Row icon="📝" label="Contexto">
              <textarea
                value={local.performance_notes || ""}
                onChange={(e) => patch("performance_notes", e.target.value)}
                onBlur={(e) => commit("performance_notes", e.target.value)}
                placeholder="ROAS, CPA, por qué funcionó o no…"
                rows={2}
                disabled={!canEdit("performance_notes")}
                style={{ ...inlineInput(), resize: "vertical", fontFamily: "inherit" }}
              />
            </Row>
          </>
        )}

        {/* Calificación de cuadrantes — solo cuando el creativo ya está en
            campaña. Permitido para trafficker / PM / owner / admin. */}
        {local.status === "in_campaign" && (
          <Row icon="⭐" label="Calificación">
            <QuadrantSelector
              value={local.performance_quadrant}
              isAdmin={canRateInCampaign(member)}
              isDark={isDark}
              T={T}
              onChange={(q) => {
                patch("performance_quadrant", q);
                onUpdate?.({
                  performance_quadrant: q,
                  performance_quadrant_at: q ? new Date().toISOString() : null,
                });
              }}
            />
          </Row>
        )}

        {!simpleMode && (
        <Row icon="💬" label="Notas">
          <textarea
            value={local.review_notes || ""}
            onChange={(e) => patch("review_notes", e.target.value)}
            onBlur={(e) => commit("review_notes", e.target.value)}
            placeholder="Feedback de revisión…"
            rows={2}
            disabled={!canEdit("review_notes")}
            style={{ ...inlineInput(), resize: "vertical", fontFamily: "inherit" }}
          />
        </Row>
        )}

        {/* Historial de revisión por stage */}
        <ReviewHistory feedback={local.review_feedback} T={T} isDark={isDark} />

        {/* Editor de guión (videos) — o galería de referencias (estáticos). */}
        <div style={{ height: 1, background: T.textHint, margin: "36px 0 20px" }} />

        {local.format === "static" ? (
          <ReferencesGallery
            conceptId={local.concept_id}
            currentCompanyId={companyId}
            isAdmin={isAdmin}
            T={T}
            isDark={isDark}
          />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18 }}>✍️</span>
              <span style={{
                fontSize: 12, color: T.textMuted, fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                Guión
              </span>
              <ScriptDurationPill
                content={initialScript}
                theme={T}
                onAdjustDensity={canEdit("script_body") ? ({ instruction }) => {
                  setAIPrefill(instruction);
                  setShowAIAdjust(true);
                } : undefined}
              />
              {canEdit("script_body") && (
                <button
                  onClick={() => { setAIPrefill(""); setShowAIAdjust(true); }}
                  style={{
                    marginLeft: "auto",
                    padding: "5px 12px",
                    borderRadius: 50, border: "none",
                    background: `linear-gradient(135deg, ${DS.blue}, ${DS.purple})`,
                    color: "#fff", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: T.font,
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                  }}
                  title="Ajustar el guión con IA"
                >
                  ✨ Ajustar con IA
                </button>
              )}
            </div>

            <textarea
              key={bodyKey}
              defaultValue={initialScript}
              onChange={(e) => patch("script_body", e.target.value)}
              onBlur={(e) => commit("script_body", e.target.value)}
              placeholder="Escribí el guión acá. Hook, cuerpo, CTA, lo que quieras — todo en un solo lugar."
              disabled={!canEdit("script_body")}
              rows={20}
              style={{
                width: "100%",
                padding: "18px 20px",
                borderRadius: 12,
                border: `1px solid ${T.textHint}`,
                background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
                color: T.textPrimary,
                fontSize: 15,
                lineHeight: 1.7,
                fontFamily: "inherit",
                outline: "none",
                resize: "vertical",
                minHeight: 320,
                boxSizing: "border-box",
              }}
            />
          </>
        )}
      </div>

      {showAIAdjust && (
        <SlotAIAdjust
          currentContent={local.script_body || initialScript}
          idea={local.title || autoAdName || "Guion"}
          formatId={null}
          initialInstruction={aiPrefill}
          onApply={(newText) => {
            // Persistimos en local + commit a DB. Incrementamos bodyKey para
            // forzar remount del textarea, que con defaultValue no reaccionaría
            // al nuevo valor de local.script_body.
            setLocal((prev) => ({ ...prev, script_body: newText }));
            onUpdate?.({ script_body: newText });
            setBodyKey((k) => k + 1);
          }}
          onClose={() => { setShowAIAdjust(false); setAIPrefill(""); }}
        />
      )}
    </div>
  );
}

// Galería de referencias del concepto — para slots de tipo Estático.
// Muestra las variations (file_url, drive_url o meta_ads_library_url) como
// thumbnails clickeables. Si la URL no es de imagen, mostramos un link.
//
// Si el concepto pertenece a un concept_group_id (merge cross-empresa),
// también muestra las variations de los hermanos del grupo. La empresa
// dueña del board ve sus refs primero. El admin además ve un tag de origen.
function ReferencesGallery({ conceptId, currentCompanyId, isAdmin, T, isDark }) {
  const [refs, setRefs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!conceptId) { setRefs([]); setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const data = await listVariationsForConcept(conceptId);
        if (!cancelled) setRefs(data);
      } catch {
        if (!cancelled) setRefs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conceptId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>🖼️</span>
        <span style={{
          fontSize: 12, color: T.textMuted, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          Referencias del concepto
        </span>
        {refs.length > 0 && (
          <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 4 }}>
            {refs.length}
          </span>
        )}
      </div>

      {!conceptId && (
        <EmptyHint T={T}>
          Asigná un concepto al slot para ver sus referencias visuales.
        </EmptyHint>
      )}

      {conceptId && loading && (
        <div style={{ color: T.textMuted, fontSize: 12, padding: "20px 0" }}>Cargando referencias…</div>
      )}

      {conceptId && !loading && refs.length === 0 && (
        <EmptyHint T={T}>
          Este concepto todavía no tiene referencias. Agregalas desde el canvas del despliegue creativo.
        </EmptyHint>
      )}

      {refs.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {refs.map((v) => (
            <ReferenceCard
              key={v.id}
              v={v}
              currentCompanyId={currentCompanyId}
              isAdmin={isAdmin}
              T={T}
              isDark={isDark}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Normaliza URLs guardadas sin protocolo (ej: "facebook.com/...") para que
// el browser no las trate como path relativo. Si no parece URL, retorna "".
function normalizeUrl(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^(https?:|mailto:|tel:|data:)/i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  // Si contiene un punto y no espacios ni protocol, asumimos que es host
  if (/^[^\s]+\.[^\s]+$/.test(s)) return `https://${s.replace(/^\/+/, "")}`;
  return "";
}

function ReferenceCard({ v, currentCompanyId, isAdmin, T, isDark }) {
  const isOwn = v.source_type === "produced";
  // Cross-company: variation de OTRA empresa que está vinculada al concepto
  // por el grupo. Para admin mostramos badge con la empresa origen.
  const isCrossCompany = currentCompanyId
    && v.origin_company_id
    && v.origin_company_id !== currentCompanyId;
  const accent = isOwn ? "#1DB97A" : "#3B8BD4";
  const imageUrl = normalizeUrl(v.file_url);
  // Link del anuncio (lo que el user pega): primero Meta Ads Library, luego Drive.
  const adUrl = normalizeUrl(v.meta_ads_library_url) || normalizeUrl(v.drive_url) || "";
  const isImage = /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(imageUrl);

  return (
    <div
      style={{
        background: isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB",
        border: `1px solid ${accent}33`,
        borderRadius: 12,
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${accent}88`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${accent}33`; }}
    >
      {/* Imagen completa (no recortada) o placeholder */}
      {isImage ? (
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener"
          style={{ display: "block", background: "#000", lineHeight: 0 }}
        >
          <img
            src={imageUrl}
            alt={v.label || "Referencia"}
            style={{
              width: "100%", height: "auto", display: "block",
            }}
          />
        </a>
      ) : (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          padding: "32px 16px", textAlign: "center",
          color: T.textMuted, fontSize: 26,
        }}>
          🖼️
        </div>
      )}

      <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 9, fontWeight: 800, color: accent,
            padding: "2px 7px", borderRadius: 50,
            background: `${accent}18`, letterSpacing: "0.06em",
          }}>
            {isOwn ? "PROPIO" : "REFERENCIA"}
          </span>
          {/* Badge admin-only de origen cross-empresa */}
          {isAdmin && isCrossCompany && v.origin_company_name && (
            <span
              title={`Esta referencia es de la empresa ${v.origin_company_name}`}
              style={{
                fontSize: 9, fontWeight: 700, color: "#7BB6E6",
                padding: "2px 7px", borderRadius: 50,
                background: "rgba(59,139,212,0.16)",
                border: "1px solid rgba(59,139,212,0.40)",
                letterSpacing: "0.04em",
              }}
            >
              🏷 {v.origin_company_name}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, lineHeight: 1.3 }}>
          {v.label || v.name || "Sin nombre"}
        </div>
        {v.transcript && (
          <div style={{
            fontSize: 11, color: T.textMuted, lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {v.transcript}
          </div>
        )}
        {adUrl && (
          <a
            href={adUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={adUrl}
            style={{
              marginTop: 4,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
              padding: "6px 10px", borderRadius: 8,
              border: `1px solid ${accent}55`,
              background: `${accent}10`,
              color: accent, textDecoration: "none",
              fontSize: 11, fontWeight: 700,
            }}
          >
            🔗 Ver anuncio
          </a>
        )}
      </div>
    </div>
  );
}

// Calificación por cuadrantes para creativos en campaña.
// Grid 2×2: inversión (alto/bajo) × resultado (bueno/malo).
// Los 4 keys matchean el CHECK constraint de `performance_quadrant`.
const QUADRANTS = [
  { key: "winner",   label: "Ganador",    hint: "Mucho gasto · buen resultado",  color: "#1D9E75", emoji: "🟢" },
  { key: "bleeder",  label: "Sangra",     hint: "Mucho gasto · mal resultado",   color: "#E24B4A", emoji: "🔴" },
  { key: "underdog", label: "Promesa",    hint: "Poco gasto · buen resultado",   color: "#D4A93B", emoji: "🟡" },
  { key: "fail",     label: "Fracaso",    hint: "Poco gasto · mal resultado",    color: "#6E6F6A", emoji: "⚫" },
];

function QuadrantSelector({ value, onChange, isAdmin, isDark, T }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 8,
      width: "100%", maxWidth: 520,
    }}>
      {QUADRANTS.map((q) => {
        const active = value === q.key;
        return (
          <button
            key={q.key}
            onClick={() => {
              if (!isAdmin) return;
              // Click sobre el activo lo deselecciona.
              onChange?.(active ? null : q.key);
            }}
            disabled={!isAdmin}
            title={q.hint}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 12,
              border: active ? `1.5px solid ${q.color}` : `1px solid ${T.textHint}`,
              background: active
                ? `${q.color}${isDark ? "22" : "14"}`
                : (isDark ? "rgba(255,255,255,0.02)" : "#FDFDFB"),
              color: T.textPrimary,
              cursor: isAdmin ? "pointer" : "default",
              fontFamily: T.font, textAlign: "left",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <span style={{ fontSize: 18 }}>{q.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 700,
                color: active ? q.color : T.textPrimary,
              }}>
                {q.label}
              </div>
              <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>
                {q.hint}
              </div>
            </div>
            {active && (
              <span style={{
                fontSize: 14, color: q.color, fontWeight: 700,
              }}>✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Historial de revisión por stage. Muestra cada entrada con decisión, loom
// (si hay) y fecha. Agrupa por stage (Guiones / Rodaje / Edición) para que
// quede claro en qué fase se dio el feedback.
function ReviewHistory({ feedback, T, isDark }) {
  const items = Array.isArray(feedback) ? feedback : [];
  if (items.length === 0) return null;

  const STAGE_LABELS = {
    idea: "Ideas",
    scripting: "Guiones",
    to_film: "Rodaje",
    to_edit: "Edición",
  };
  const DECISION_META = {
    approved: { label: "Aprobado", color: "#1D9E75", icon: "✅" },
    changes_requested: { label: "Cambios pedidos", color: "#E24B4A", icon: "✏️" },
  };

  const byStage = new Map();
  for (const f of items) {
    const k = f.stage || "unknown";
    if (!byStage.has(k)) byStage.set(k, []);
    byStage.get(k).push(f);
  }
  const stageOrder = ["idea", "scripting", "to_film", "to_edit"];
  const stages = [...byStage.keys()].sort((a, b) => {
    const ai = stageOrder.indexOf(a); const bi = stageOrder.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const fmtDate = (iso) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <span style={{
          fontSize: 12, color: T.textMuted, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          Historial de revisiones
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((stage) => {
          const list = [...byStage.get(stage)]
            .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
          return (
            <div key={stage} style={{
              padding: "10px 14px", borderRadius: 10,
              background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.025)",
              border: `1px solid ${T.textHint}`,
            }}>
              <div style={{
                fontSize: 10.5, fontWeight: 700, color: T.textMuted,
                letterSpacing: "0.08em", textTransform: "uppercase",
                marginBottom: 8,
              }}>
                Feedback · {STAGE_LABELS[stage] || stage}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {list.map((f) => {
                  const meta = DECISION_META[f.decision] || { label: f.decision, color: T.textMuted, icon: "•" };
                  return (
                    <div key={f.id} style={{
                      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                      fontSize: 11.5, color: T.textSecondary,
                    }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        padding: "2px 9px", borderRadius: 50,
                        background: `${meta.color}18`, color: meta.color,
                        fontSize: 10.5, fontWeight: 700,
                      }}>
                        {meta.icon} {meta.label}
                      </span>
                      <span style={{ fontSize: 10.5, color: T.textMuted }}>{fmtDate(f.at)}</span>
                      {f.loom_url && (
                        <a
                          href={f.loom_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 9px", borderRadius: 50,
                            border: `1px solid ${T.textHint}`,
                            color: T.textSecondary, textDecoration: "none",
                            fontSize: 10.5, fontWeight: 600,
                          }}
                          title={f.loom_url}
                        >
                          🎥 Ver Loom
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyHint({ T, children }) {
  return (
    <div style={{
      padding: "20px 16px", textAlign: "center", borderRadius: 12,
      border: `1px dashed ${T.textHint}`, color: T.textMuted, fontSize: 12, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

// Hook helpers: script_hooks era JSONB. Lo usamos solo como fallback para
// migrar suavemente al textarea único.
function hookFromHooks(hooks) {
  if (!hooks) return "";
  if (typeof hooks === "string") return hooks;
  if (Array.isArray(hooks)) return hooks.map((h) => h?.text || h).filter(Boolean).join("\n");
  if (typeof hooks === "object" && hooks.text) return hooks.text;
  return "";
}

// ───── Row (icon + label + value) ──────────────────────────────────────

function Row({ icon, label, children }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "28px 180px 1fr",
      alignItems: "center",
      gap: 10,
      padding: "10px 0",
      borderBottom: `1px solid ${DS.textHint}`,
    }}>
      <span style={{ fontSize: 15, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 13, color: DS.textSecondary, fontWeight: 500 }}>{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ───── Estilos ─────────────────────────────────────────────────────────

function ghostBtn() {
  return {
    padding: "8px 16px", borderRadius: 50,
    border: "none", background: "transparent",
    color: DS.textPrimary, fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  };
}

function darkBtn() {
  return {
    padding: "9px 22px", borderRadius: 50,
    border: "none", background: DS.textPrimary,
    color: DS.bg, fontSize: 13, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
  };
}

function trashBtn() {
  return {
    width: 40, height: 40, borderRadius: "50%",
    border: `1px solid ${DS.red}55`,
    background: "transparent", color: DS.red,
    cursor: "pointer", fontSize: 14,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "inherit",
  };
}

function inlineInput() {
  return {
    width: "100%", padding: "6px 10px",
    border: "none", background: "transparent",
    color: DS.textPrimary, fontSize: 13,
    fontFamily: "inherit", outline: "none",
    borderRadius: 4,
    transition: "background 0.15s",
  };
}

function selectStyle() {
  return {
    width: "100%", padding: "7px 10px",
    border: DS.border, borderRadius: 6,
    background: DS.bgCard,
    color: DS.textPrimary, fontSize: 13,
    fontFamily: "inherit", outline: "none",
    cursor: "pointer",
  };
}

function pill(active, accent) {
  return {
    padding: "6px 14px", borderRadius: 50,
    border: `1.5px solid ${active ? accent : DS.textHint}`,
    background: active ? accent : "transparent",
    color: active ? "#fff" : DS.textSecondary,
    fontSize: 11.5, fontWeight: 700,
    cursor: "pointer", fontFamily: "inherit",
    transition: "background 0.12s, color 0.12s, border-color 0.12s",
    boxShadow: active ? `0 2px 8px ${accent}55` : "none",
  };
}

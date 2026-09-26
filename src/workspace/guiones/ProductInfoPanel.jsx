import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { useCompanyId } from "./context.js";
import { useVoiceProfile } from "./hooks/useVoiceProfile.js";
import { upsertVoiceProfile } from "./workspace_guiones_db.js";
import { ExpertiseDocuments } from "./ExpertiseDocuments.jsx";
import { NICHES_LIST as NICHES, questionsForNiche } from "../../lib/niches.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { logger } from "../../lib/logger.js";
// xlsx (~150 KB) se carga sólo si el user sube un .xlsx — dynamic import
// para que no engorde el bundle inicial. Ver `isXlsx` block más abajo.

// Reemplaza Voz y Expertise. Para empresas (no marcas personales): nicho
// del negocio + tarjeticas de producto con preguntas específicas por nicho.
// Este contexto se envía al generador de guiones.
//
// Los nichos y sus preguntas viven en src/lib/niches.js — compartidos entre
// el wizard de signup y este panel. Las keys legacy (suplementos, joyeria,
// moda, servicios, otro) siguen funcionando para empresas existentes.

// LocalStorage mirror — red de seguridad si DB falla. Key por companyId.
const LS_KEY = (companyId) => `inforce_product_info_backup_${companyId}`;
function saveLocalBackup(companyId, niche, products) {
  try {
    if (!companyId) return;
    localStorage.setItem(LS_KEY(companyId), JSON.stringify({
      niche, products, savedAt: new Date().toISOString(),
    }));
  } catch {}
}
function readLocalBackup(companyId) {
  try {
    if (!companyId) return null;
    const raw = localStorage.getItem(LS_KEY(companyId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function ProductInfoPanel() {
  const companyId = useCompanyId();
  const { voice, loading, reload } = useVoiceProfile();

  const [niche, setNiche] = useState("");
  // Cuando ya hay nicho elegido, ocultamos el grid y mostramos solo un chip
  // compacto. Click en "Cambiar" expande el grid de nuevo. Reduce ruido
  // visual en una decisión que ya está tomada y rara vez cambia.
  const [editingNiche, setEditingNiche] = useState(false);
  const [products, setProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // product object o {} para nuevo
  const [backup, setBackup] = useState(null); // {niche, products, savedAt}

  useEffect(() => {
    if (voice) {
      setNiche(voice.niche || "");
      setProducts(Array.isArray(voice.products) ? voice.products : []);
    }
    // Al cargar, leemos el backup local para ofrecer restore si DB perdió datos.
    const b = readLocalBackup(companyId);
    if (b && (b.niche || (Array.isArray(b.products) && b.products.length > 0))) {
      const dbIsEmpty = !voice || (!voice.niche && !(voice.products?.length));
      if (dbIsEmpty) setBackup(b);
    }
  }, [voice, companyId]);

  // Error global del panel (niche picker) — separate del error del modal.
  const [persistErr, setPersistErr] = useState(null);

  // persist ahora RETORNA {ok, error, data} con diagnóstico completo.
  // Logs al console con TODOS los detalles que Supabase devuelve.
  const persist = async (nextNiche, nextProducts) => {
    if (!companyId) return { ok: false, error: "No hay companyId" };
    setSaving(true);
    setPersistErr(null);
    const payload = {
      niche: nextNiche ?? niche,
      products: nextProducts ?? products,
    };
    // Backup local ANTES de intentar persistir — así aunque el DB falle, el
    // usuario no pierde su trabajo.
    saveLocalBackup(companyId, payload.niche, payload.products);
    logger.info("[InfoProducto] persist →", { companyId, payload });
    try {
      const res = await upsertVoiceProfile(companyId, payload);
      if (res?.error) {
        setSaving(false);
        // Log EXHAUSTIVO para que puedas leer en DevTools qué falló.
        logger.error("[InfoProducto] database error", {
          message: res.error.message,
          details: res.error.details,
          hint: res.error.hint,
          code: res.error.code,
          companyId,
          payload,
        });
        const composed = [
          res.error.message,
          res.error.details && `Detalles: ${res.error.details}`,
          res.error.hint && `Sugerencia: ${res.error.hint}`,
          res.error.code && `Código: ${res.error.code}`,
        ].filter(Boolean).join(" · ");
        setPersistErr(composed);
        return { ok: false, error: composed, supabaseError: res.error };
      }
      logger.info("[InfoProducto] database OK", { data: res.data });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      await reload();
      return { ok: true, data: res.data };
    } catch (err) {
      setSaving(false);
      logger.error("[InfoProducto] persist exception:", err);
      const msg = err?.message || String(err);
      setPersistErr(msg);
      return { ok: false, error: msg };
    }
  };

  const pickNiche = async (k) => {
    setNiche(k);
    setEditingNiche(false);
    await persist(k, null);
  };

  // Devuelve { ok, error } al modal. Sólo cerramos el modal si el guardado
  // fue exitoso — así el usuario no pierde datos por un fallo de red/DB.
  const saveProduct = async (p) => {
    const nextProducts = p.id
      ? products.map((x) => x.id === p.id ? p : x)
      : [...products, { ...p, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
    const result = await persist(null, nextProducts);
    if (result.ok) {
      setProducts(nextProducts);
      setEditingProduct(null);
    }
    return result;
  };

  const deleteProduct = async (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    const nextProducts = products.filter((p) => p.id !== id);
    setProducts(nextProducts);
    await persist(null, nextProducts);
  };

  if (loading) {
    return <div style={{ color: DS.textMuted, fontSize: 12, padding: "40px 0", textAlign: "center" }}>Cargando…</div>;
  }

  const activeMeta = NICHES.find((n) => n.key === niche);
  const questions = niche ? questionsForNiche(niche) : [];

  // Heurística: si voice cargó (no null), pero no existe la prop products
  // (ni siquiera array vacío), sospechamos que la migración company_product_info
  // no se corrió (columna products no existe).
  const migrationMissing = voice && voice.products === undefined;

  // ¿Hay inconsistencia? Si tenemos productos en memoria pero el voice cargado
  // no los trae, algo raro pasa (o el save falló sin avisar).
  const memoryMismatch = products.length > 0
    && Array.isArray(voice?.products)
    && voice.products.length !== products.length;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em", marginBottom: 4 }}>
          INFO DEL PRODUCTO
        </div>
        <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.6 }}>
          Definí el nicho de la empresa y agregá los productos. El generador de guiones usa este contexto para escribir mejor.
        </div>
      </div>

      {backup && (
        <div style={{
          padding: "14px 16px", borderRadius: 12, marginBottom: 14,
          background: `${DS.blue}14`, border: `1px solid ${DS.blue}55`, color: DS.textPrimary,
          fontSize: 12, lineHeight: 1.5,
        }}>
          <div style={{ fontWeight: 700, color: DS.blue, marginBottom: 4 }}>
            💾 Tenés una copia local guardada
          </div>
          <div style={{ color: DS.textSecondary, marginBottom: 8 }}>
            La base de datos está vacía pero hay un backup local con {backup.products?.length || 0} producto{(backup.products?.length || 0) !== 1 ? "s" : ""} (guardado {new Date(backup.savedAt).toLocaleString("es-CO")}). ¿Querés restaurarlo?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={async () => {
                setNiche(backup.niche || "");
                setProducts(backup.products || []);
                const result = await persist(backup.niche || "", backup.products || []);
                if (result.ok) setBackup(null);
              }}
              style={{
                padding: "7px 14px", borderRadius: 50, border: "none",
                background: DS.blue, color: "#fff",
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}
            >
              Restaurar backup
            </button>
            <button
              onClick={() => {
                try { localStorage.removeItem(LS_KEY(companyId)); } catch {}
                setBackup(null);
              }}
              style={{
                padding: "7px 14px", borderRadius: 50,
                background: "transparent", color: DS.textMuted,
                border: `1px solid ${DS.textHint}`,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
              }}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {migrationMissing && (
        <div style={{
          padding: "14px 16px", borderRadius: 12, marginBottom: 14,
          background: `${DS.red}12`, border: `1px solid ${DS.red}55`, color: DS.red,
          fontSize: 12, lineHeight: 1.5, fontWeight: 600,
        }}>
          ⚠️ La base de datos parece no tener las columnas <code>niche</code> / <code>products</code>.<br />
          Corré esta migración en Supabase SQL Editor:
          <pre style={{
            marginTop: 8, padding: "10px 12px", borderRadius: 8,
            background: "rgba(0,0,0,0.45)", color: DS.textPrimary,
            fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap",
          }}>{`alter table public.company_voice_profile
  add column if not exists niche text,
  add column if not exists products jsonb not null default '[]'::jsonb;`}</pre>
        </div>
      )}

      {persistErr && !migrationMissing && (
        <div style={{
          padding: "12px 14px", borderRadius: 12, marginBottom: 14,
          background: `${DS.red}14`, border: `1px solid ${DS.red}55`, color: DS.red,
          fontSize: 12, lineHeight: 1.5, fontWeight: 600,
        }}>
          ❌ Error al guardar: {persistErr}
          <div style={{ fontSize: 10, fontWeight: 500, color: DS.textMuted, marginTop: 4 }}>
            Abrí la consola del navegador (F12 → Console) y copiame el mensaje que dice <code>[InfoProducto] database error</code>.
          </div>
        </div>
      )}

      {memoryMismatch && (
        <div style={{
          padding: "10px 14px", borderRadius: 12, marginBottom: 14,
          background: `${DS.blue}14`, border: `1px solid ${DS.blue}55`, color: DS.blue,
          fontSize: 11.5, fontWeight: 600,
        }}>
          Hay diferencia entre lo guardado en la base ({voice?.products?.length ?? 0}) y lo que ves aquí ({products.length}). Refrescá la página para sincronizar.
        </div>
      )}

      {/* Niche picker — colapsado a chip compacto cuando ya hay nicho */}
      {(!niche || editingNiche) ? (
        <div style={{
          padding: "14px 16px", borderRadius: 14,
          background: DS.bgCard, border: DS.border,
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
              {niche ? "CAMBIAR NICHO" : "NICHO DEL NEGOCIO"}
            </div>
            {niche && editingNiche && (
              <button
                onClick={() => setEditingNiche(false)}
                style={{
                  background: "transparent", border: "none", color: DS.textMuted,
                  cursor: "pointer", fontSize: 11, fontWeight: 600,
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
            {NICHES.map((n) => {
              const active = niche === n.key;
              return (
                <button
                  key={n.key}
                  onClick={() => {
                    if (active) { setEditingNiche(false); return; }
                    if (niche && niche !== n.key && !confirm(
                      `¿Cambiar nicho de "${activeMeta?.label || niche}" a "${n.label}"?\n\n` +
                      `Esto NO borra los productos cargados, pero las preguntas asociadas al nicho cambian.`
                    )) return;
                    pickNiche(n.key);
                  }}
                  style={{
                    padding: "11px 14px", borderRadius: 12,
                    border: `1px solid ${active ? n.color : DS.textHint}`,
                    background: active ? `${n.color}14` : "transparent",
                    color: active ? n.color : DS.textPrimary,
                    cursor: "pointer", fontFamily: DS.font,
                    display: "flex", alignItems: "center", gap: 10,
                    textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{n.emoji}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{n.label}</span>
                </button>
              );
            })}
          </div>
          {saving && <div style={{ fontSize: 10, color: DS.textMuted, marginTop: 8 }}>Guardando…</div>}
          {saved && <div style={{ fontSize: 10, color: DS.green, marginTop: 8 }}>Guardado ✓</div>}
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
          padding: "10px 14px", borderRadius: 12,
          background: `${activeMeta?.color || DS.textMuted}10`,
          border: `1px solid ${activeMeta?.color || DS.textHint}55`,
          marginBottom: 18,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 18 }}>{activeMeta?.emoji}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: DS.textMuted, letterSpacing: "0.14em" }}>
                NICHO
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: activeMeta?.color || DS.textPrimary, marginTop: 1 }}>
                {activeMeta?.label || niche}
              </div>
            </div>
          </div>
          <button
            onClick={() => setEditingNiche(true)}
            title="Cambiar nicho"
            style={{
              background: "transparent", border: `1px solid ${DS.textHint}`,
              borderRadius: 50, padding: "5px 12px",
              color: DS.textMuted, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: DS.font,
              whiteSpace: "nowrap",
            }}
          >
            ⋯ Cambiar
          </button>
        </div>
      )}

      {/* Products */}
      {niche ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: DS.textPrimary }}>
                Productos {activeMeta && <span style={{ color: activeMeta.color }}>· {activeMeta.label}</span>}
              </div>
              <div style={{ fontSize: 11, color: DS.textMuted }}>
                {products.length} producto{products.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={() => setEditingProduct({})}
              style={{
                padding: "8px 14px", borderRadius: 50, border: "none",
                background: activeMeta?.color || DS.textPrimary, color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
              }}
            >
              + Agregar producto
            </button>
          </div>

          {products.length === 0 ? (
            <div style={{
              padding: "36px 20px", textAlign: "center", borderRadius: 14,
              background: DS.bgCard, border: `1px dashed ${DS.textHint}`,
              color: DS.textMuted, fontSize: 12.5, lineHeight: 1.6,
            }}>
              Aún no hay productos cargados. Agregá tu primer producto para que el guionista use su info.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 10,
            }}>
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  color={activeMeta?.color || DS.blue}
                  onClick={() => setEditingProduct(p)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{
          padding: "28px 20px", textAlign: "center", borderRadius: 14,
          background: DS.bgCard, border: `1px dashed ${DS.textHint}`,
          color: DS.textMuted, fontSize: 12.5, lineHeight: 1.6,
        }}>
          Seleccioná un nicho arriba para empezar a cargar productos.
        </div>
      )}

      {editingProduct && (
        <ProductModal
          product={editingProduct}
          questions={questions}
          niche={niche}
          color={activeMeta?.color || DS.blue}
          namePlaceholder={activeMeta?.productPlaceholder || "Nombre del producto"}
          onClose={() => setEditingProduct(null)}
          onSave={saveProduct}
          onDelete={editingProduct.id ? () => { deleteProduct(editingProduct.id); setEditingProduct(null); } : null}
        />
      )}

      {/* Documentos de expertise — pega guiones/docs y el sistema extrae un
          resumen inteligente una sola vez. El guionista los usa como contexto. */}
      <div style={{ marginTop: 28, paddingTop: 20, borderTop: DS.border }}>
        <ExpertiseDocuments />
      </div>

      {/* Diagnóstico al pie — útil si algo se pierde y necesitás reportarlo. */}
      <div style={{
        marginTop: 32, paddingTop: 14, borderTop: DS.border,
        fontSize: 10, color: DS.textMuted, fontFamily: "monospace",
        display: "flex", gap: 14, flexWrap: "wrap",
      }}>
        <span>company: <b style={{ color: DS.textSecondary }}>{companyId || "—"}</b></span>
        <span>db nicho: <b style={{ color: DS.textSecondary }}>{voice?.niche || "—"}</b></span>
        <span>db productos: <b style={{ color: DS.textSecondary }}>{Array.isArray(voice?.products) ? voice.products.length : (voice?.products === undefined ? "columna faltante" : "—")}</b></span>
        <span>en memoria: <b style={{ color: DS.textSecondary }}>{products.length}</b></span>
      </div>
    </div>
  );
}

function ProductCard({ product, color, onClick }) {
  // Contar campos con valor (excluyendo id, name, documents/context que se muestran aparte).
  const SKIP = new Set(["id", "name", "documents", "context"]);
  const filled = Object.keys(product).filter((k) => !SKIP.has(k) && product[k]).length;
  const docsCount = Array.isArray(product.documents) ? product.documents.length : 0;
  const hasContext = !!(product.context && product.context.trim());
  return (
    <button
      onClick={onClick}
      style={{
        padding: "14px 16px 12px", borderRadius: 12,
        background: DS.bgCard,
        border: `1px solid ${color}33`,
        color: DS.textPrimary, cursor: "pointer", fontFamily: DS.font,
        textAlign: "left", display: "flex", flexDirection: "column", gap: 6,
        minHeight: 110, position: "relative", overflow: "hidden",
        transition: "border-color 120ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}88`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${color}33`; }}
    >
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: color, opacity: 0.7,
      }} />
      <div style={{ fontSize: 14, fontWeight: 700, color: DS.textPrimary, marginTop: 4 }}>
        {product.name || "Sin nombre"}
      </div>
      {product.what && (
        <div style={{ fontSize: 11.5, color: DS.textSecondary, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {product.what}
        </div>
      )}
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: DS.textMuted, fontWeight: 700, letterSpacing: "0.06em" }}>
        <span>{filled} CAMP{filled !== 1 ? "OS" : "O"}</span>
        {hasContext && <span>· CONTEXTO ✓</span>}
        {docsCount > 0 && <span>· 📄 {docsCount} DOC{docsCount !== 1 ? "S" : ""}</span>}
      </div>
    </button>
  );
}

function ProductModal({ product, questions, niche, color, namePlaceholder, onClose, onSave, onDelete }) {
  const [name, setName] = useState(product.name || "");
  const [fields, setFields] = useState(() => {
    const init = {};
    questions.forEach((q) => { init[q.key] = product[q.key] || ""; });
    return init;
  });
  const [context, setContext] = useState(product.context || "");
  const [documents, setDocuments] = useState(product.documents || []); // [{ name, content }]
  const [uploadErr, setUploadErr] = useState("");
  const [extracting, setExtracting] = useState(false); // mientras Claude procesa el documento
  const [extractedSummary, setExtractedSummary] = useState(""); // feedback breve al terminar
  const [saveErr, setSaveErr] = useState(""); // error de persist
  const [saving, setSaving] = useState(false); // mientras se guarda
  const [confirmExit, setConfirmExit] = useState(false); // muestra dialog de confirmar salida
  const [hasInteracted, setHasInteracted] = useState(false); // cualquier edit activa el "dirty forever"

  // Ref: dónde empezó el mousedown. Evita que arrastrar/seleccionar texto
  // dentro del modal cierre el modal cuando el mouseup cae fuera (backdrop).
  const mouseDownOnBackdropRef = useRef(false);

  // Snapshot inicial para detectar cambios sin guardar.
  const [initialSnapshot] = useState(() => JSON.stringify({
    name: product.name || "",
    fields: (() => {
      const init = {};
      questions.forEach((q) => { init[q.key] = product[q.key] || ""; });
      return init;
    })(),
    context: product.context || "",
    documents: product.documents || [],
  }));

  const currentSnapshot = JSON.stringify({ name, fields, context, documents });
  // Dirty: snapshot cambió O el usuario interactuó alguna vez (aunque haya
  // revertido el texto al original). Así no se pierden ediciones por un
  // click accidental después de borrar y reescribir.
  const isDirty = hasInteracted || currentSnapshot !== initialSnapshot;

  // Wrappers que marcan la interacción y setean el estado.
  const touch = () => { if (!hasInteracted) setHasInteracted(true); };
  const setNameSafe = (v) => { touch(); setName(v); };
  const setFieldSafe = (k, v) => { touch(); setFields((prev) => ({ ...prev, [k]: v })); };
  const setContextSafe = (v) => { touch(); setContext(v); };

  // Intentos de cierre pasan por aquí: si hay cambios, pedimos confirmación.
  const attemptClose = () => {
    if (extracting || saving) return; // nunca cerrar mientras hay IO activo
    if (isDirty) {
      setConfirmExit(true);
    } else {
      onClose?.();
    }
  };

  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        attemptClose();
      }
    };
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, extracting, saving]);

  // Red de seguridad: advertir si se intenta cerrar la pestaña/recargar.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const submit = async () => {
    if (!name.trim()) return;
    setSaveErr("");
    setSaving(true);
    try {
      const result = await onSave({
        ...product,
        name: name.trim(),
        ...fields,
        context: context.trim() || "",
        documents,
      });
      if (result && result.ok === false) {
        setSaveErr("No se pudo guardar: " + (result.error || "error desconocido"));
      }
      // Si ok=true, el padre cierra el modal.
    } catch (err) {
      setSaveErr("Error inesperado: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    setUploadErr("");
    setExtractedSummary("");
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // permite re-subir el mismo archivo
    touch(); // marcar como dirty tan pronto como el usuario suba un archivo

    // Límite 10MB. Los PDFs pueden ser grandes y Claude los soporta bien hasta ~20MB.
    if (file.size > 10 * 1024 * 1024) {
      setUploadErr("Archivo muy grande (>10MB). Subí uno más chico.");
      return;
    }

    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name)
      || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      || file.type === "application/vnd.ms-excel";
    const isText = /\.(txt|md|markdown|csv|text|rtf)$/i.test(file.name) || file.type.startsWith("text/");

    if (!isPdf && !isXlsx && !isText) {
      setUploadErr("Formatos soportados: PDF, XLSX, XLS, CSV, TXT, MD.");
      return;
    }

    setExtracting(true);
    try {
      // Preparamos el payload según el tipo.
      let payload = {
        fileName: file.name,
        mimeType: file.type,
        niche,
        questions: questions.map((q) => ({ key: q.key, label: q.label })),
        currentFields: fields,
        currentName: name,
        currentContext: context,
      };

      let docContent = ""; // texto que guardamos en documents[] para referencia
      if (isPdf) {
        const buf = await file.arrayBuffer();
        payload.fileBase64 = arrayBufferToBase64(buf);
        docContent = `(PDF ${(file.size / 1024).toFixed(0)} KB — procesado por IA)`;
      } else if (isXlsx) {
        const buf = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const sheets = wb.SheetNames.map((sn) => {
          const ws = wb.Sheets[sn];
          return `## Hoja: ${sn}\n${XLSX.utils.sheet_to_csv(ws)}`;
        });
        docContent = sheets.join("\n\n");
        payload.textContent = docContent;
      } else {
        docContent = await file.text();
        payload.textContent = docContent;
      }

      const res = await fetch("/api/extract-product-info", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errBody?.error || `Error ${res.status}`);
      }

      const { name: extractedName, fields: extractedFields, context: extractedContext } = await res.json();

      // Auto-llenamos campos VACÍOS (no pisamos lo que ya puso el usuario).
      let filledCount = 0;
      if (extractedName && !name.trim()) {
        setName(extractedName);
        filledCount++;
      }
      if (extractedFields && typeof extractedFields === "object") {
        setFields((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(extractedFields)) {
            if (v && String(v).trim() && !(next[k] || "").trim()) {
              next[k] = String(v).trim();
              filledCount++;
            }
          }
          return next;
        });
      }
      // Notas adicionales: appendeamos al contexto existente.
      if (extractedContext && extractedContext.trim()) {
        const separator = context.trim() ? "\n\n" : "";
        const header = `— Extraído de ${file.name} —\n`;
        setContext(context + separator + header + extractedContext.trim());
      }

      // Guardamos el documento en la lista.
      setDocuments((prev) => [...prev, {
        name: file.name,
        content: docContent.slice(0, 10000), // cap por si es enorme
        kind: isPdf ? "pdf" : (isXlsx ? "xlsx" : "text"),
      }]);

      setExtractedSummary(
        filledCount > 0
          ? `✓ Se llenaron ${filledCount} campo${filledCount !== 1 ? "s" : ""} y se agregó contexto`
          : "✓ Se agregó el contenido al contexto"
      );
      setTimeout(() => setExtractedSummary(""), 4000);
    } catch (err) {
      setUploadErr("No se pudo procesar el archivo: " + (err?.message || err));
    } finally {
      setExtracting(false);
    }
  };

  const removeDoc = (idx) => {
    touch();
    setDocuments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = (e.target === e.currentTarget);
      }}
      onMouseUp={(e) => {
        // Sólo cerramos si TANTO el mousedown como el mouseup ocurrieron en el
        // backdrop. Si el user empezó a arrastrar/seleccionar texto dentro del
        // modal y soltó fuera, NO contamos como intento de cierre.
        if (mouseDownOnBackdropRef.current && e.target === e.currentTarget) {
          attemptClose();
        }
        mouseDownOnBackdropRef.current = false;
      }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        zIndex: 10005, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font, overflowY: "auto",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 16, width: "100%", maxWidth: 560,
          color: DS.textPrimary, padding: "22px 24px 20px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          position: "relative", overflow: "hidden",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 4,
          background: color, opacity: 0.8,
        }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4, marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>
            {product.id ? "Editar producto" : "Nuevo producto"}
            {isDirty && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: DS.textMuted, letterSpacing: "0.08em" }}>• SIN GUARDAR</span>}
          </h3>
          <button onClick={attemptClose} style={{
            background: "transparent", border: "none", color: DS.textMuted,
            cursor: "pointer", fontSize: 17, padding: "0 4px",
          }}>×</button>
        </div>

        <div style={{ overflowY: "auto", paddingRight: 4, flex: 1 }}>
          <FieldLabel>Nombre del producto *</FieldLabel>
          <input
            value={name}
            onChange={(e) => setNameSafe(e.target.value)}
            placeholder={namePlaceholder}
            autoFocus
            style={inputStyle()}
          />

          {questions.map((q) => (
            <div key={q.key}>
              <FieldLabel style={{ marginTop: 14 }}>{q.label}</FieldLabel>
              {q.multiline ? (
                <textarea
                  value={fields[q.key] || ""}
                  onChange={(e) => setFieldSafe(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  rows={3}
                  style={{ ...inputStyle(), resize: "vertical", minHeight: 60, lineHeight: 1.5 }}
                />
              ) : (
                <input
                  value={fields[q.key] || ""}
                  onChange={(e) => setFieldSafe(q.key, e.target.value)}
                  placeholder={q.placeholder}
                  style={inputStyle()}
                />
              )}
            </div>
          ))}

          {/* Sección universal: contexto / reglas / documentos del producto */}
          <div style={{ marginTop: 20, paddingTop: 14, borderTop: DS.border }}>
            <FieldLabel style={{ marginTop: 0 }}>Contexto / reglas del producto</FieldLabel>
            <div style={{ fontSize: 10.5, color: DS.textMuted, marginBottom: 6, marginTop: -2 }}>
              Cualquier regla, lineamiento o información adicional que el guionista deba respetar (tono, claim legal, términos obligatorios, etc.).
            </div>
            <textarea
              value={context}
              onChange={(e) => setContextSafe(e.target.value)}
              placeholder="Ej: nunca decir 'garantía', siempre mencionar 'resultados pueden variar'…"
              rows={4}
              style={{ ...inputStyle(), resize: "vertical", minHeight: 90, lineHeight: 1.5 }}
            />

            {/* Documentos adjuntos */}
            <FieldLabel style={{ marginTop: 14 }}>Documentos adjuntos ({documents.length})</FieldLabel>
            <div style={{ fontSize: 10.5, color: DS.textMuted, marginBottom: 6, marginTop: -2 }}>
              Subí PDF, XLSX, CSV, TXT o MD. El IA lee el documento y auto-llena los campos del producto; lo que no encaje queda como notas en el contexto.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {documents.map((d, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", borderRadius: 10,
                  background: DS.bgCard, border: `1px solid ${color}33`,
                }}>
                  <span style={{ fontSize: 14 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {d.name}
                    </div>
                    <div style={{ fontSize: 10, color: DS.textMuted }}>
                      {(d.content?.length || 0).toLocaleString("es-CO")} caracteres
                    </div>
                  </div>
                  <button
                    onClick={() => removeDoc(i)}
                    style={{
                      background: "transparent", border: `1px solid ${DS.textHint}`,
                      borderRadius: 8, color: DS.red,
                      fontSize: 11, fontWeight: 600, cursor: "pointer",
                      padding: "4px 10px", fontFamily: DS.font,
                    }}
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 50,
              border: `1px dashed ${color}88`,
              background: `${color}14`, color: color,
              fontSize: 11, fontWeight: 700,
              cursor: extracting ? "wait" : "pointer",
              marginTop: documents.length ? 10 : 4,
              fontFamily: DS.font,
              opacity: extracting ? 0.7 : 1,
            }}>
              {extracting ? "🤖 Procesando con IA…" : "📎 Adjuntar PDF / XLSX / TXT"}
              <input
                type="file"
                accept=".pdf,.xlsx,.xls,.csv,.txt,.md,.markdown,.text,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/plain,text/markdown,text/csv"
                style={{ display: "none" }}
                onChange={handleFileUpload}
                disabled={extracting}
              />
            </label>
            {extracting && (
              <div style={{ color: DS.textMuted, fontSize: 11, marginTop: 6, fontStyle: "italic" }}>
                Leyendo el documento y extrayendo la info del producto…
              </div>
            )}
            {extractedSummary && (
              <div style={{ color: DS.green, fontSize: 11, marginTop: 6, fontWeight: 600 }}>
                {extractedSummary}
              </div>
            )}
            {uploadErr && <div style={{ color: DS.red, fontSize: 11, marginTop: 6 }}>{uploadErr}</div>}
          </div>
        </div>

        {saveErr && (
          <div style={{
            marginTop: 10, padding: "8px 12px", borderRadius: 10,
            background: `${DS.red}18`, border: `1px solid ${DS.red}55`,
            color: DS.red, fontSize: 11, fontWeight: 600, lineHeight: 1.5,
          }}>
            {saveErr}
          </div>
        )}

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 16, paddingTop: 12, borderTop: DS.border, gap: 10,
        }}>
          {onDelete ? (
            <button
              onClick={onDelete}
              disabled={saving}
              style={{
                padding: "8px 14px", borderRadius: 50,
                background: "transparent", color: DS.red,
                border: `1px solid ${DS.red}55`,
                fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
                opacity: saving ? 0.6 : 1,
              }}
            >
              Eliminar
            </button>
          ) : <span />}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={attemptClose}
              disabled={saving}
              style={{
                padding: "9px 16px", borderRadius: 50,
                background: "transparent", color: DS.textSecondary,
                border: `1px solid ${DS.textHint}`,
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
                opacity: saving ? 0.6 : 1,
              }}
            >Cancelar</button>
            <button
              onClick={submit}
              disabled={!name.trim() || saving}
              style={{
                padding: "9px 18px", borderRadius: 50, border: "none",
                background: color, color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: (saving || !name.trim()) ? "not-allowed" : "pointer", fontFamily: DS.font,
                opacity: (name.trim() && !saving) ? 1 : 0.5,
              }}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      {confirmExit && (
        <ConfirmExitDialog
          onStay={() => setConfirmExit(false)}
          onLeave={() => { setConfirmExit(false); onClose?.(); }}
        />
      )}
    </div>
  );
}

function ConfirmExitDialog({ onStay, onLeave }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onStay(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        zIndex: 10010, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, fontFamily: DS.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: DS.bgSide, border: DS.border,
          borderRadius: 16, maxWidth: 420, width: "100%",
          padding: "22px 24px", color: DS.textPrimary,
          boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
        }}
      >
        <div style={{ fontSize: 22, marginBottom: 10 }}>⚠️</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>
          ¿Seguro que querés salir?
        </h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: DS.textSecondary, lineHeight: 1.55 }}>
          Tenés cambios sin guardar. Si salís ahora se van a perder — incluido el contenido que la IA extrajo del documento.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onLeave}
            style={{
              padding: "9px 16px", borderRadius: 50,
              background: "transparent", color: DS.textMuted,
              border: `1px solid ${DS.textHint}`,
              fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
            }}
          >
            Salir y perder cambios
          </button>
          <button
            onClick={onStay}
            autoFocus
            style={{
              padding: "9px 20px", borderRadius: 50, border: "none",
              background: DS.green, color: "#06060A",
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: DS.font,
              boxShadow: `0 4px 18px ${DS.green}55`,
            }}
          >
            Quedarme
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, color: DS.textMuted, fontWeight: 700,
      letterSpacing: "0.14em", textTransform: "uppercase",
      marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}

function inputStyle() {
  return {
    width: "100%", padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${DS.textHint}`,
    background: "transparent",
    color: DS.textPrimary,
    fontSize: 13, fontFamily: DS.font,
    outline: "none", boxSizing: "border-box",
  };
}

// Conversión ArrayBuffer → base64 por chunks (evita stack overflow con PDFs grandes).
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

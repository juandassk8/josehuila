import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { LabelChips } from "../../despliegue/ReferenceLabelUI.jsx";
import { listBankConcepts } from "../concept_bank/db.js";
import { updateInboxItem, setInboxStatus } from "./inboxDb.js";

// Feed de re-etiquetado tipo TikTok/IG: José baja una referencia a la vez, ve el
// video + su info (marca/nicho/ángulo/descripción/transcripción), y corrige el
// FORMATO al vuelo (el campo que la IA más falla) sin abrir modal ni recargar.
// "✓ Está bien" la aprueba (queda lista para cargar al banco) y avanza. Teclado:
// J/↓ siguiente · K/↑ anterior · Enter aprobar · Esc salir.
//
// Props:
//   items       — subconjunto a revisar (ya filtrado por la Bandeja)
//   companyName — fn(company_id) → nombre de empresa
//   onUpdated   — fn(updatedRow) para que la Bandeja sincronice su estado
//   onClose     — cerrar el feed

const STAGES = [
  { key: "tofu", label: "TOFU", color: DS.blue },
  { key: "mofu", label: "MOFU", color: DS.amber },
  { key: "bofu", label: "BOFU", color: DS.green },
];

// Video reproducible inline: preferimos el respaldo estable (Supabase/mp4 directo)
// y si no, el video de Foreplay/Apify (fbcdn, puede expirar). Los links de Drive
// no se reproducen inline → devolvemos null (mostramos la portada).
function playableVideo(it) {
  const b = it.video_backup_url || "";
  if (/database/i.test(b) || /\.mp4($|\?)/i.test(b)) return b;
  return it.ai_raw?.video_url || null;
}

export function RetagFeed({ items = [], companyName = () => "—", onUpdated, onClose }) {
  const [list, setList] = useState(items);
  const [active, setActive] = useState(0);
  const [bankConcepts, setBankConcepts] = useState(null);
  const [approvedCount, setApprovedCount] = useState(0);
  const scroller = useRef(null);
  const slideRefs = useRef([]);
  const videoRefs = useRef([]);

  useEffect(() => { setList(items); }, [items]);
  useEffect(() => { listBankConcepts().then(setBankConcepts).catch(() => setBankConcepts([])); }, []);

  // Índice activo según qué slide está visible (scroll-snap).
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number(e.target.dataset.idx));
      }
    }, { root, threshold: [0.6] });
    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [list.length]);

  // Solo el video activo reproduce (el resto se pausa).
  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === active) v.play?.().catch(() => {});
      else v.pause?.();
    });
  }, [active]);

  const goTo = useCallback((i) => {
    const n = Math.max(0, Math.min(list.length - 1, i));
    slideRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(n);
  }, [list.length]);

  const applyPatch = useCallback(async (item, changes) => {
    setList((L) => L.map((it) => (it.id === item.id ? { ...it, ...changes } : it)));
    try { const updated = await updateInboxItem(item.id, changes); onUpdated?.(updated); }
    catch { /* mantenemos el optimista; un reload lo corrige */ }
  }, [onUpdated]);

  const setStatus = useCallback(async (item, status) => {
    if (!item) return;
    setList((L) => L.map((it) => (it.id === item.id ? { ...it, status } : it)));
    if (status === "approved") setApprovedCount((n) => n + 1);
    try { const u = await setInboxStatus(item.id, status); onUpdated?.(u); } catch { /* reload lo corrige */ }
    goTo(active + 1);
  }, [active, goTo, onUpdated]);

  // Teclado (sin interferir cuando se está escribiendo en un input).
  useEffect(() => {
    const h = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea";
      if (e.key === "Escape") { if (typing) e.target.blur(); else onClose?.(); return; }
      if (typing) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); goTo(active + 1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); goTo(active - 1); }
      else if (e.key === "Enter") { e.preventDefault(); setStatus(list[active], "approved"); }
    };
    window.addEventListener("keydown", h);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = prevOverflow; };
  }, [active, list, goTo, setStatus, onClose]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10003, background: DS.bg, fontFamily: DS.font, display: "flex", flexDirection: "column" }}>
      {/* Barra superior */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${DS.textHint}`, background: DS.bgSide }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: DS.textPrimary }}>🎬 Revisar etiquetas</span>
        <span style={{ fontSize: 12, color: DS.textMuted }}>
          {list.length ? `${Math.min(active + 1, list.length)} / ${list.length}` : "0"}
          {approvedCount > 0 && <> · <span style={{ color: DS.green, fontWeight: 700 }}>✓ {approvedCount} aprobados</span></>}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: DS.textMuted }}>J/↓ siguiente · K/↑ anterior · Enter aprobar · Esc salir</span>
        <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>Cerrar ✕</button>
      </div>

      {/* Feed con scroll-snap vertical */}
      <div ref={scroller} style={{ flex: 1, overflowY: "auto", scrollSnapType: "y mandatory" }}>
        {list.length === 0 ? (
          <div style={{ padding: 80, textAlign: "center", color: DS.textMuted, fontSize: 14 }}>No hay referencias para revisar.</div>
        ) : list.map((it, i) => (
          <div
            key={it.id}
            data-idx={i}
            ref={(el) => (slideRefs.current[i] = el)}
            style={{ scrollSnapAlign: "start", minHeight: "calc(100vh - 49px)", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          >
            <Slide
              item={it}
              active={i === active}
              near={Math.abs(i - active) <= 1}
              companyName={companyName}
              bankConcepts={bankConcepts}
              videoRef={(el) => (videoRefs.current[i] = el)}
              onPatch={(changes) => applyPatch(it, changes)}
              onApprove={() => setStatus(it, "approved")}
              onReject={() => setStatus(it, "rejected")}
              onPrev={() => goTo(i - 1)}
              onNext={() => goTo(i + 1)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide({ item, active, near, companyName, bankConcepts, videoRef, onPatch, onApprove, onReject, onPrev, onNext }) {
  const vsrc = playableVideo(item);
  const stage = item.suggested_stage || "tofu";
  const fconf = typeof item.ai_raw?.format_confidence === "number" ? item.ai_raw.format_confidence : null;
  const reason = item.ai_raw?.format_reason || null;
  const isApproved = item.status === "approved";
  const isRejected = item.status === "rejected";

  return (
    <div style={{ width: "min(1040px, 100%)", display: "flex", gap: 22, alignItems: "stretch", flexWrap: "wrap" }}>
      {/* Media */}
      <div style={{ flex: "0 0 300px", maxWidth: 340, minWidth: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", aspectRatio: "9 / 16", maxHeight: "78vh", borderRadius: 16, overflow: "hidden", background: "#000", border: DS.border, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {vsrc && near ? (
            <video ref={videoRef} src={vsrc} poster={item.cover_url || undefined}
              muted loop playsInline controls
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
          ) : item.cover_url ? (
            <img src={item.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <span style={{ fontSize: 40, opacity: 0.35 }}>{item.suggested_media_type === "static" ? "🖼" : "🎬"}</span>
          )}
        </div>
      </div>

      {/* Info + edición */}
      <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 14, maxHeight: "82vh", overflowY: "auto", paddingRight: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: DS.textMuted }}>{companyName(item.company_id)}</span>
          {item.source_kind === "ai" && typeof item.ai_confidence === "number" && (
            <span style={{ fontSize: 10, fontWeight: 800, color: DS.purple }}>✨ IA {Math.round(item.ai_confidence * 100)}%</span>
          )}
          {item.ai_raw?.days_running != null && (
            <span title="Días corriendo (más = mejor)" style={{ fontSize: 10, fontWeight: 800, color: DS.green }}>🏆 {item.ai_raw.days_running}d</span>
          )}
          {item.source_url && /^https?:\/\//i.test(item.source_url) && (
            <a href={item.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: DS.blue, textDecoration: "none" }}>Abrir anuncio ↗</a>
          )}
          {isApproved && <span style={{ fontSize: 10, fontWeight: 800, color: DS.green, background: withAlpha(DS.green, "1e"), borderRadius: 50, padding: "2px 9px" }}>✓ Aprobado</span>}
          {isRejected && <span style={{ fontSize: 10, fontWeight: 800, color: DS.red, background: withAlpha(DS.red, "1e"), borderRadius: 50, padding: "2px 9px" }}>✕ Rechazado</span>}
        </div>

        {/* Nombre/hook */}
        {item.suggested_name && <div style={{ fontSize: 16, fontWeight: 800, color: DS.textPrimary }}>{item.suggested_name}</div>}

        {/* Etiquetas que suelen estar bien (solo lectura) */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <LabelChips v={{ bank_labels: item.suggested_labels }} max={6} compact />
        </div>

        {/* FORMATO — lo importante */}
        <div style={{ padding: 14, borderRadius: 12, border: `1px solid ${fconf != null && fconf < 0.6 ? withAlpha(DS.amber, "88") : DS.border}`, background: DS.bgCard }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: DS.textMuted }}>Formato</span>
            {fconf != null && (
              <span title="Confianza de la IA en el formato" style={{ fontSize: 10, fontWeight: 800, color: fconf < 0.6 ? DS.amber : DS.green }}>
                {fconf < 0.6 ? "⚠ " : ""}{Math.round(fconf * 100)}%
              </span>
            )}
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 5 }}>
              {STAGES.map((s) => (
                <button key={s.key} onClick={() => onPatch({ suggested_stage: s.key })} style={{
                  padding: "3px 9px", borderRadius: 50, cursor: "pointer", fontFamily: DS.font, fontSize: 10, fontWeight: 800,
                  border: stage === s.key ? `1.5px solid ${s.color}` : DS.border,
                  background: stage === s.key ? withAlpha(s.color, "22") : "transparent",
                  color: stage === s.key ? s.color : DS.textMuted,
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: item.suggested_format ? DS.textPrimary : DS.textMuted, marginBottom: reason ? 4 : 10 }}>
            {item.suggested_format || "Sin formato"}
          </div>
          {reason && <div style={{ fontSize: 11.5, color: DS.textMuted, fontStyle: "italic", marginBottom: 10 }}>“{reason}”</div>}
          {active && (
            <FormatPicker
              item={item}
              concepts={bankConcepts}
              onPick={(c) => onPatch({ suggested_format: c.name, target_concept_id: c.id, suggested_stage: c.stage || stage })}
              onNew={(nm) => onPatch({ suggested_format: nm.trim() || null, target_concept_id: null })}
            />
          )}
        </div>

        {/* Descripción / notas / transcripción */}
        {item.suggested_description && (
          <Block label="Cómo está hecho">{item.suggested_description}</Block>
        )}
        {item.note && <Block label="Nota">{item.note}</Block>}
        {item.transcript && item.transcript.trim() && (
          <Collapsible label="Transcripción">{item.transcript}</Collapsible>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4, position: "sticky", bottom: 0, background: DS.bg, paddingTop: 8 }}>
          <button onClick={onApprove} style={{ padding: "10px 22px", borderRadius: 50, border: "none", background: DS.green, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: DS.font }}>
            ✓ Está bien
          </button>
          <button onClick={onReject} style={{ padding: "10px 16px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.red, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font }}>
            ✕ Rechazar
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onPrev} style={navBtn}>↑ Anterior</button>
          <button onClick={onNext} style={navBtn}>Siguiente ↓</button>
        </div>
      </div>
    </div>
  );
}

// Buscador de formatos del banco CON su patrón (para elegir bien) + opción de
// escribir uno nuevo. Reusa el patrón del picker de InboxItemModal.
function FormatPicker({ item, concepts, onPick, onNew }) {
  const [term, setTerm] = useState("");
  const [newName, setNewName] = useState("");
  const options = useMemo(() => {
    if (!concepts) return [];
    const t = term.trim().toLowerCase();
    const pipe = item.pipeline_type || "ads";
    // Buscamos por NOMBRE del formato (no por la descripción — traía basura tipo
    // "antes"/"intenta" matcheando "tes"). El company_name ayuda para desambiguar.
    const list = concepts.filter((c) => (c.pipeline_type || "ads") === pipe).filter((c) => {
      if (!t) return true;
      return (c.name || "").toLowerCase().includes(t) || (c.company_name || "").toLowerCase().includes(t);
    });
    // Ranking: lo que EMPIEZA con lo escrito primero, luego lo que lo contiene,
    // luego misma empresa, luego alfabético.
    const rank = (c) => {
      const n = (c.name || "").toLowerCase();
      if (!t) return 2;
      return n.startsWith(t) ? 0 : n.includes(t) ? 1 : 2;
    };
    list.sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      const aOwn = item.company_id && a.company_id === item.company_id ? 0 : 1;
      const bOwn = item.company_id && b.company_id === item.company_id ? 0 : 1;
      if (aOwn !== bOwn) return aOwn - bOwn;
      return (a.name || "").localeCompare(b.name || "");
    });
    // Deduplicar por nombre para no repetir el mismo formato por empresa.
    const seen = new Set();
    const out = [];
    for (const c of list) {
      const k = (c.name || "").toLowerCase().trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    return out.slice(0, 60);
  }, [concepts, term, item.pipeline_type, item.company_id]);

  return (
    <div>
      <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Cambiar formato — buscá en el banco…"
        style={inputStyle} />
      <div style={{ maxHeight: 200, overflowY: "auto", border: DS.border, borderRadius: 8, background: DS.bgSide, marginTop: 6 }}>
        {concepts === null && <div style={{ padding: 12, color: DS.textMuted, fontSize: 12 }}>Cargando formatos…</div>}
        {concepts !== null && options.length === 0 && (
          <div style={{ padding: 12, color: DS.textMuted, fontSize: 12 }}>{term ? "Ningún formato matchea." : "Sin formatos en el banco."}</div>
        )}
        {options.map((c) => {
          const chosen = item.target_concept_id === c.id;
          const pat = (c.description || c.execution || "").trim();
          return (
            <button key={c.id} onClick={() => onPick(c)} style={{
              display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", cursor: "pointer",
              fontFamily: DS.font, background: chosen ? withAlpha(DS.blue, "22") : "transparent",
              color: DS.textPrimary, borderBottom: `1px solid ${withAlpha(DS.textHint, "40")}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: DS.textMuted, textTransform: "uppercase" }}>{c.stage || "—"}</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                {chosen && <span style={{ fontSize: 10, color: DS.blue, fontWeight: 800 }}>✓</span>}
              </div>
              {pat && <div style={{ fontSize: 10.5, color: DS.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pat}</div>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { onNew(newName); setNewName(""); } }}
          placeholder="…o escribí un formato nuevo" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={() => { if (newName.trim()) { onNew(newName); setNewName(""); } }} disabled={!newName.trim()}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${DS.green}`, background: withAlpha(DS.green, "18"), color: DS.green, fontSize: 12, fontWeight: 800, cursor: newName.trim() ? "pointer" : "default", fontFamily: DS.font, opacity: newName.trim() ? 1 : 0.5, whiteSpace: "nowrap" }}>
          Usar
        </button>
      </div>
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: DS.textSecondary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

function Collapsible({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "transparent", border: "none", color: DS.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: DS.font, padding: 0 }}>
        {open ? "▾" : "▸"} {label}
      </button>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 220, overflowY: "auto", padding: "10px 12px", borderRadius: 8, background: DS.bgCard, border: DS.border, color: DS.textSecondary, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border,
  background: DS.bgSide, color: DS.textPrimary, fontSize: 13,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const navBtn = {
  padding: "8px 14px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};

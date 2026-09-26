import { useEffect, useState } from "react";
import { DS, withAlpha } from "../../lib/design.js";
import { BANK_REFS_COMPANY_NAME } from "../concept_bank/db.js";
import { fetchForeplayBoards, fetchForeplayAds, fetchForeplayDiscover, importForeplayAds } from "./inboxDb.js";

// Trae anuncios de Foreplay → Bandeja. Dos modos:
//  - Board: sincroniza un board que ya armaste en Foreplay.
//  - Descubrir: pegás un link/dominio/nombre de marca y trae TODOS sus anuncios.
// Foreplay suele traer video/thumbnail/transcripción, así que evita el fetch a Meta.
export function ForeplaySyncModal({ companies = [], onClose, onImported }) {
  const [mode, setMode] = useState("discover"); // discover | board
  const [credits, setCredits] = useState(null);
  const [error, setError] = useState(null);

  // Board mode
  const [boards, setBoards] = useState(null);
  const [boardId, setBoardId] = useState("");

  // Discover mode
  const [seed, setSeed] = useState("");
  const [limit, setLimit] = useState(30);
  const [importMsg, setImportMsg] = useState("");   // avance del blindaje de portadas

  // Orden / calidad (compartido). Por defecto: los que llevan MÁS tiempo
  // corriendo = los ganadores (Facebook no da impresiones de anuncios
  // comerciales, la longevidad es el mejor proxy de éxito).
  const [order, setOrder] = useState("longest_running");
  const [minDays, setMinDays] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const qualityOpts = () => ({ order, minDays: Number(minDays) || 0, activeOnly });

  // Compartido
  const [ads, setAds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [pipeline, setPipeline] = useState("ads");
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchForeplayBoards()
      .then(({ boards, credits }) => { setBoards(boards); if (credits != null) setCredits(credits); })
      .catch((e) => { setBoards([]); if (mode === "board") setError(e?.message || String(e)); });
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && !importing) onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, importing]);

  // Un mismo creativo ganador corre como muchos anuncios distintos (misma
  // pieza, diferentes ad_id y URLs). Deduplicamos por el NOMBRE DE ARCHIVO del
  // video/portada, que sí es estable para el mismo creativo aunque la URL
  // completa y el token cambien.
  const fileKey = (u) => {
    if (!u) return "";
    try { return new URL(u).pathname.split("/").pop() || ""; }
    catch { return u.split("?")[0].split("/").pop() || ""; }
  };
  const dedupeAds = (list) => {
    const seen = new Set();
    return (list || []).filter((a) => {
      const key = fileKey(a.video_url) || fileKey(a.cover_url) || a.source_url || "";
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const loadBoardAds = async (id) => {
    setBoardId(id); setAds(null); setError(null);
    if (!id) return;
    setLoading(true);
    try {
      const { ads, credits } = await fetchForeplayAds(id, 50, qualityOpts());
      setAds(dedupeAds(ads)); if (credits != null) setCredits(credits);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  const runDiscover = async () => {
    if (!seed.trim()) return;
    setAds(null); setError(null); setLoading(true);
    try {
      const { ads, credits } = await fetchForeplayDiscover(seed.trim(), limit, qualityOpts());
      setAds(dedupeAds(ads)); if (credits != null) setCredits(credits);
    } catch (e) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  const doImport = async () => {
    if (!ads?.length) return;
    setImporting(true); setError(null); setImportMsg("");
    try {
      const { created, yaEstaban, copias } = await importForeplayAds(ads, { companyId: companyId || null, pipelineType: pipeline, onProgress: setImportMsg });
      await onImported?.(created, { autoAnalyze, yaEstaban, copias });
      onClose?.();
    } catch (e) { setError(e?.message || String(e)); setImporting(false); setImportMsg(""); }
  };

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget && !importing) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10003, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: "min(580px, 96vw)", maxHeight: "92vh", background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16, color: DS.textPrimary, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 90px rgba(0,0,0,0.6)" }}>
        <div style={{ padding: "16px 22px 12px", borderBottom: `1px solid ${DS.textHint}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DS.amber, marginBottom: 5, fontWeight: 800 }}>Foreplay</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Traer anuncios</h3>
          </div>
          {credits != null && (
            <span style={{ fontSize: 10, fontWeight: 700, color: DS.textMuted, border: DS.border, borderRadius: 50, padding: "3px 9px" }}>
              🪙 {credits.toLocaleString()} créditos
            </span>
          )}
          <button onClick={onClose} disabled={importing} style={{ width: 30, height: 30, borderRadius: 8, border: DS.border, background: "transparent", color: DS.textSecondary, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px 20px" }}>
          {/* Toggle de modo */}
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2, marginBottom: 16 }}>
            <ModeBtn active={mode === "discover"} onClick={() => { setMode("discover"); setAds(null); setError(null); }}>🔍 Descubrir por marca</ModeBtn>
            <ModeBtn active={mode === "board"} onClick={() => { setMode("board"); setAds(null); setError(null); }}>📋 Un board mío</ModeBtn>
          </div>

          {mode === "discover" ? (
            <Field label="Marca a descubrir (link de un anuncio, dominio, o nombre)">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={seed} onChange={(e) => setSeed(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runDiscover(); }}
                  placeholder="ej: bairanplus.com · Bairan Plus · o pegá un link de Ads Library"
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={runDiscover} disabled={loading || !seed.trim()} style={{ ...primaryBtn, padding: "9px 16px", opacity: loading || !seed.trim() ? 0.55 : 1 }}>
                  {loading ? "Buscando…" : "Buscar"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: DS.textMuted }}>Traer hasta</span>
                <input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                  style={{ ...inputStyle, width: 70, padding: "6px 8px" }} />
                <span style={{ fontSize: 11, color: DS.textMuted }}>anuncios (1 crédito c/u)</span>
              </div>
            </Field>
          ) : (
            <Field label="Board de Foreplay">
              {boards === null ? <div style={{ fontSize: 12, color: DS.textMuted }}>Cargando boards…</div>
                : boards.length === 0 ? <div style={{ fontSize: 12, color: DS.textMuted }}>No se encontraron boards.</div>
                : (
                  <select value={boardId} onChange={(e) => loadBoardAds(e.target.value)} style={inputStyle}>
                    <option value="">Elegí un board…</option>
                    {boards.map((b) => <option key={b.id} value={b.id}>{b.name}{b.count != null ? ` (${b.count})` : ""}</option>)}
                  </select>
                )}
            </Field>
          )}

          {/* Orden / calidad — traer los ganadores (más tiempo corriendo) */}
          <Field label="¿Cuáles traer?">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={order} onChange={(e) => setOrder(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "1 1 220px" }}>
                <option value="longest_running">🏆 Más tiempo corriendo (ganadores)</option>
                <option value="newest">🆕 Más recientes</option>
                <option value="oldest">Más antiguos</option>
                <option value="most_relevant">Más relevantes</option>
              </select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: activeOnly ? DS.green : DS.textMuted, cursor: "pointer", fontWeight: 700 }}>
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                Solo activos
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: DS.textMuted }}>Mínimo</span>
              <input type="number" min={0} max={3650} value={minDays} onChange={(e) => setMinDays(e.target.value)} placeholder="0"
                style={{ ...inputStyle, width: 70, padding: "6px 8px" }} />
              <span style={{ fontSize: 11, color: DS.textMuted }}>días corriendo (0 = sin filtro)</span>
            </div>
          </Field>

          {loading && <div style={{ fontSize: 12, color: DS.textMuted, marginBottom: 12 }}>Consultando Foreplay…</div>}
          {ads != null && !loading && (
            <div style={{ fontSize: 12, color: ads.length ? DS.green : DS.textMuted, marginBottom: 10, fontWeight: 700 }}>
              {ads.length ? `✓ ${ads.length} anuncios listos para traer` : "No se encontraron anuncios. Probá con otro término/link."}
            </div>
          )}
          {ads?.length > 0 && !loading && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, marginBottom: 14 }}>
              {ads.slice(0, 18).map((a, i) => (
                <div key={i} title={a.days_running != null ? `${a.days_running} días corriendo` : ""}
                  style={{ position: "relative", aspectRatio: "3/4", borderRadius: 6, overflow: "hidden", background: DS.bgCard, border: DS.border }}>
                  {a.cover_url && <img src={a.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  {a.days_running != null && (
                    <span style={{ position: "absolute", bottom: 2, left: 2, right: 2, fontSize: 8, fontWeight: 800, color: "#fff", background: "rgba(29,158,117,0.9)", borderRadius: 3, padding: "1px 3px", textAlign: "center", lineHeight: 1.3 }}>
                      {a.days_running}d
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <Field label="Empresa destino">
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={inputStyle}>
              <option value="">🏦 {BANK_REFS_COMPANY_NAME} (sin empresa)</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Pipeline">
            <div style={{ display: "inline-flex", padding: 3, borderRadius: 50, background: DS.bgCard, border: DS.border, gap: 2 }}>
              {[{ k: "ads", l: "🎬 Creativos" }, { k: "organic", l: "🌱 Contenido" }].map((p) => (
                <button key={p.k} onClick={() => setPipeline(p.k)} style={{ padding: "6px 12px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: DS.font, fontSize: 11, fontWeight: 700, background: pipeline === p.k ? withAlpha(DS.blue, "22") : "transparent", color: pipeline === p.k ? DS.blue : DS.textMuted }}>{p.l}</button>
              ))}
            </div>
          </Field>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: autoAnalyze ? DS.purple : DS.textSecondary, cursor: "pointer", fontWeight: 700 }}>
            <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} />
            ✨ Analizar con IA al traerlos
          </label>

          {error && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 12 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 22px", borderTop: `1px solid ${DS.textHint}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={importing} style={ghostBtn}>Cancelar</button>
          <button onClick={doImport} disabled={importing || !ads?.length} style={{ ...primaryBtn, opacity: importing || !ads?.length ? 0.55 : 1 }}>
            {importing ? (importMsg || "Trayendo…") : `Traer ${ads?.length || ""} a la bandeja`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeBtn({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 50, border: "none", cursor: "pointer", fontFamily: DS.font,
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      background: active ? withAlpha(DS.amber, "22") : "transparent",
      color: active ? DS.amber : DS.textMuted,
    }}>{children}</button>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard, color: DS.textPrimary, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
const primaryBtn = { padding: "9px 22px", borderRadius: 50, border: "none", background: "#1D9E75", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };
const ghostBtn = { padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font };

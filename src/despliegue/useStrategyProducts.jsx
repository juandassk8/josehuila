// Fase B — Estrategia de ventas POR PRODUCTO, sincronizada con el Content Pipeline.
//
// Fuente única = company_voice_profile.products[i].touchpoints (el mismo objeto que
// edita Content Pipeline → Configurar). Este hook le da al StrategyModal/StrategyBoard
// del Despliegue un selector de producto, guarda la estrategia en el producto elegido
// y ESPEJA al board.config.touchpoints (para que la vista read-only del cliente siga
// funcionando sin cambios). Migra la estrategia general vieja al primer producto.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DS } from "../lib/design.js";
import { logger } from "../lib/logger.js";
import { useCompanyProducts } from "../workspace/guiones/hooks/useCompanyProducts.js";
import { upsertVoiceProfile } from "../workspace/guiones/workspace_guiones_db.js";
import { updateBoardConfig } from "./db.js";

const TP_KEYS = ["angles", "objections", "awareness"];
const hasTp = (tp) => !!tp && TP_KEYS.some((k) => (tp[k] || []).length);
const EMPTY_TP = { angles: [], objections: [], awareness: [] };
const newProd = (name) => ({ id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name, touchpoints: { ...EMPTY_TP }, creators: [] });

// Selector compacto de producto para el header del StrategyModal.
function ProductStrategySelector({ products, selId, onSelect, onAdd }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DS.textMuted }}>Producto</span>
      <select value={selId || ""} onChange={(e) => onSelect(e.target.value)}
        style={{ appearance: "none", fontFamily: DS.font, fontSize: 12.5, fontWeight: 600, color: DS.textPrimary, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 12px", cursor: "pointer" }}>
        {products.length === 0 && <option value="">General</option>}
        {products.map((p) => <option key={p.id} value={p.id}>{p.name || "Sin nombre"}</option>)}
      </select>
      <button type="button" onClick={onAdd}
        style={{ fontFamily: DS.font, fontSize: 12, fontWeight: 600, color: "var(--sel)", background: "var(--sel-soft)", border: "1px solid rgba(88,166,255,0.3)", borderRadius: 9, padding: "6px 11px", cursor: "pointer" }}>+ Nuevo producto</button>
    </div>
  );
}

export function useStrategyProducts({ companyId, board, patchBoardConfig }) {
  const { products, reload } = useCompanyProducts(companyId);
  const [selId, setSelId] = useState(null);
  const migratedRef = useRef(false);

  // Al cambiar de empresa, resetear la selección y la bandera de migración. Los
  // views NO se re-montan por empresa → sin esto quedaría el selId/migratedRef de
  // la empresa anterior (riesgo: escribir estrategia de una empresa en otra).
  useEffect(() => { setSelId(null); migratedRef.current = false; }, [companyId]);

  useEffect(() => { if (!selId && products.length) setSelId(products[0].id); }, [products, selId]);

  // Migración no destructiva: si el board tiene estrategia general y ningún producto
  // tiene touchpoints, copiar al primer producto (una sola vez).
  useEffect(() => {
    if (migratedRef.current || !products.length) return;
    // El board debe ser el de ESTA empresa (board y products cargan async por
    // separado; sin este guard se podría migrar la estrategia de otra empresa).
    if (board?.company_id && String(board.company_id) !== String(companyId)) return;
    const boardTp = board?.config?.touchpoints;
    if (hasTp(boardTp) && !products.some((p) => hasTp(p.touchpoints))) {
      migratedRef.current = true;
      const next = products.map((p, i) => (i === 0 ? { ...p, touchpoints: boardTp } : p));
      upsertVoiceProfile(companyId, { products: next }).then(reload).catch((e) => logger.error("migración estrategia falló", e));
    }
  }, [products, board, companyId, reload]);

  const selected = products.find((p) => p.id === selId) || null;
  const touchpoints = selected?.touchpoints || board?.config?.touchpoints || null;

  const addProduct = useCallback(async () => {
    const name = (window.prompt("Nombre del nuevo producto:") || "").trim();
    if (!name) return;
    const p = newProd(name);
    try { await upsertVoiceProfile(companyId, { products: [...products, p] }); await reload(); setSelId(p.id); }
    catch (e) { logger.error("crear producto falló", e); }
  }, [companyId, products, reload]);

  // Guarda la estrategia en el producto elegido + espeja a board.config.
  const saveStrategy = useCallback(async ({ touchpoints: tp, mode, guide }) => {
    let list = products, id = selId;
    if (!list.find((p) => p.id === id)) { const np = newProd("General"); list = [...list, np]; id = np.id; setSelId(id); }
    const next = list.map((p) => (p.id === id ? { ...p, touchpoints: tp } : p));
    try { await upsertVoiceProfile(companyId, { products: next }); await reload(); }
    catch (e) { logger.error("guardar estrategia (producto) falló", e); }
    // Espejo a board.config → la vista read-only del cliente sigue funcionando.
    const patch = { touchpoints: tp, strategy_mode: mode, strategy_guide: guide };
    patchBoardConfig?.(patch);
    if (board?.id) { try { await updateBoardConfig(board.id, { ...(board.config || {}), ...patch }); } catch (e) { logger.error("espejo board.config falló", e); } }
  }, [companyId, products, selId, reload, patchBoardConfig, board]);

  const productSelector = useMemo(
    () => <ProductStrategySelector products={products} selId={selId} onSelect={setSelId} onAdd={addProduct} />,
    [products, selId, addProduct],
  );

  return { touchpoints, selId, productSelector, saveStrategy };
}

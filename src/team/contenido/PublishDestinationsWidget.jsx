import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import {
  destinationStatus,
  allDestinationsDone,
  requiredDestinations,
} from "./publishDestinations.js";
import { togglePublishDestination, setContentStatus } from "../data/contentDb.js";
import { database } from "../../lib/backend.js";
import { logger } from "../../lib/logger.js";

const RELATIVE_FMT = (iso) => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch { return null; }
};

// Widget "Publicar en" — muestra las 2 casillas según el tipo del item.
// Click toggle: actualizamos el state local INMEDIATAMENTE (optimistic) y
// persistimos en background. Si la DB falla, revertimos. Sin esto el click
// se siente con 1-2s de delay porque hay que esperar el roundtrip.
//
// Props:
//   item: el content_item (necesita tipo, status, publish_destinations)
//   onItemUpdated: callback con el item actualizado (para refrescar el padre)
//   readOnly: deshabilita los clicks
export function PublishDestinationsWidget({ item, onItemUpdated, readOnly = false }) {
  // Override local de las casillas — aplicado encima de item.publish_destinations.
  // El override se LIMPIA solo cuando el `item` del prop ya refleja el valor
  // (es decir, después de que realtime/reload trajo la data nueva al padre).
  // Antes lo limpiábamos justo después del DB success — pero el prop todavía
  // tenía el valor viejo, causando un flicker visual ✓ → ✗ → ✓.
  const [override, setOverride] = useState({});

  // Item efectivo con override aplicado para render.
  const effectiveItem = useMemo(() => {
    if (Object.keys(override).length === 0) return item;
    return {
      ...item,
      publish_destinations: { ...(item.publish_destinations || {}), ...override },
    };
  }, [item, override]);

  // Cleanup diferido: cuando el `item` del prop ya refleja un override
  // (es decir, el realtime/reload trajo la data nueva), limpiamos ese key
  // del override. Sin esto el flicker que el user reportó.
  useEffect(() => {
    setOverride((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      let changed = false;
      const next = {};
      for (const [key, val] of Object.entries(prev)) {
        const real = item?.publish_destinations?.[key];
        if (!!real?.done === !!val.done) {
          // El padre ya refleja este toggle — drop el override.
          changed = true;
          continue;
        }
        next[key] = val;
      }
      return changed ? next : prev;
    });
  }, [item?.publish_destinations]);

  const required = requiredDestinations(effectiveItem?.tipo);
  if (!required) {
    return (
      <div style={{
        marginTop: 12, padding: 12, borderRadius: 10,
        background: "rgba(245,166,35,0.08)",
        border: "1px solid rgba(245,166,35,0.3)",
        color: DS.amber, fontSize: 12, lineHeight: 1.5,
        fontFamily: DS.font,
      }}>
        ⚠️ Asigná un <strong>tipo</strong> al video (Likeness o Autoridad) para ver las casillas de publicación.
      </div>
    );
  }

  const dests = destinationStatus(effectiveItem) || [];
  const allDone = allDestinationsDone(effectiveItem);
  const showAutoPromoteHint = effectiveItem.status === "to_post" && allDone === false;

  // Toggle OPTIMISTIC: update local instantáneo, DB en background.
  const handleToggle = (destKey, currentDone) => {
    if (readOnly) return;
    const newDone = !currentDone;
    const optimisticEntry = {
      done: newDone,
      posted_at: newDone ? new Date().toISOString() : null,
    };
    // 1. Apply local immediately — la UI se actualiza ya.
    setOverride((prev) => ({ ...prev, [destKey]: optimisticEntry }));

    // 2. Persistir en background. Si todas las casillas quedan done y el
    //    item está en to_post, auto-promovemos a posted.
    (async () => {
      try {
        const { error } = await togglePublishDestination(item, destKey, newDone);
        if (error) {
          // Revert override
          setOverride((prev) => {
            const next = { ...prev };
            delete next[destKey];
            return next;
          });
          logger.error("[PublishDestinations] toggle failed", error);
          return;
        }

        // Auto-promote a posted si corresponde. Calculamos sobre el override
        // local para no esperar otro roundtrip.
        const merged = {
          ...item,
          publish_destinations: {
            ...(item.publish_destinations || {}),
            ...override,
            [destKey]: optimisticEntry,
          },
        };
        if (item.status === "to_post" && allDestinationsDone(merged)) {
          await setContentStatus(item.id, "posted").catch((e) =>
            logger.error("[PublishDestinations] auto-promote failed", e)
          );
        }

        // Refrescamos el item completo desde DB y notificamos al padre.
        // El override NO se limpia acá — el effect de cleanup lo hace cuando
        // el prop `item` del padre refleja el valor (evita el flicker).
        const { data: fresh } = await database
          .from("content_items")
          .select("*")
          .eq("id", item.id)
          .single();
        if (fresh) {
          onItemUpdated?.(fresh);
        }
      } catch (e) {
        // Revert override on unexpected error
        setOverride((prev) => {
          const next = { ...prev };
          delete next[destKey];
          return next;
        });
        logger.error("[PublishDestinations] unexpected error", e);
      }
    })();
  };

  return (
    <div style={{
      marginTop: 14, padding: 14, borderRadius: 10,
      background: "rgba(29,185,122,0.05)",
      border: "1px solid rgba(29,185,122,0.18)",
      fontFamily: DS.font,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: DS.textPrimary, letterSpacing: "0.02em" }}>
          📢 Publicar en
        </span>
        <span style={{ fontSize: 10, color: DS.textMuted, letterSpacing: "0.06em" }}>
          {effectiveItem.tipo}
        </span>
        <span style={{ flex: 1 }} />
        {allDone && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 50,
            background: "rgba(29,185,122,0.2)", color: "#1DB97A", letterSpacing: "0.04em",
          }}>
            ✓ TODO PUBLICADO
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {dests.map((d) => (
          <button
            key={d.key}
            onClick={() => handleToggle(d.key, d.done)}
            disabled={readOnly}
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 10,
              border: d.done
                ? "1px solid rgba(29,185,122,0.5)"
                : "1px solid rgba(255,255,255,0.1)",
              background: d.done ? "rgba(29,185,122,0.12)" : "rgba(255,255,255,0.02)",
              cursor: readOnly ? "default" : "pointer",
              fontFamily: DS.font, textAlign: "left",
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            <span style={{
              width: 22, height: 22, borderRadius: "50%",
              border: `2px solid ${d.done ? "#1DB97A" : "rgba(255,255,255,0.25)"}`,
              background: d.done ? "#1DB97A" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0,
            }}>
              {d.done ? "✓" : ""}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: d.done ? "#1DB97A" : DS.textPrimary,
              }}>
                {d.meta.icon} {d.meta.label}
              </div>
              <div style={{
                fontSize: 10, color: DS.textMuted, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {d.meta.handle}
              </div>
              {d.posted_at && (
                <div style={{
                  fontSize: 9, color: DS.textSecondary, marginTop: 3,
                  letterSpacing: "0.02em",
                }}>
                  {RELATIVE_FMT(d.posted_at)}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {showAutoPromoteHint && (
        <div style={{
          marginTop: 10, fontSize: 10, color: DS.textMuted,
          letterSpacing: "0.02em", fontStyle: "italic",
        }}>
          Cuando chulees las {dests.length} casillas, el item pasa solo a Posted.
        </div>
      )}
    </div>
  );
}

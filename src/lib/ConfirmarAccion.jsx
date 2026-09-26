import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DS } from "./design.js";

// Confirmación de una acción destructiva, dentro del portal.
//
// Antes eran `confirm()` del navegador. Dos problemas: es una caja del sistema
// operativo en medio del portal —rompe la estética y no dice de qué producto
// es—, y sobre todo BLOQUEA la pestaña entera mientras está abierta: nada de la
// página responde hasta que alguien la cierra a mano. Con procesos que tardan
// minutos y corren sobre miles de referentes, eso es una trampa.
//
// Mismo lenguaje visual que `ExcludeConfirmModal`, que ya hacía esto bien.
//
// Vive en `lib/` porque lo usan el Banco de creativos y el Despliegue: el
// problema no era del banco, era de usar diálogos del navegador.
//
// Se dibuja colgado del body. Un `z-index` alto no alcanza: si CUALQUIER ancestro
// crea un contexto de apilamiento —basta un `position: relative` con `z-index: 1`,
// que es lo que tiene el contenedor del Despliegue— el modal solo compite dentro
// de ese contexto y queda tapado por paneles que están más arriba en el árbol.
// Colgado del body no tiene ancestros que lo limiten.
// `accion.escribir` sube el precio de decir que sí: hasta que no se teclee ese
// texto exacto, el botón no se puede apretar. Es para lo que se lleva trabajo de
// otra gente por delante —un brief con sus decenas de guiones—, donde un clic de
// más no se puede deshacer. Para lo demás alcanza con confirmar.
export function ConfirmarAccion({ accion, onCancel }) {
  const [tecleado, setTecleado] = useState("");
  useEffect(() => { setTecleado(""); }, [accion?.escribir, accion?.titulo]);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  if (!accion) return null;

  return createPortal(
    <div onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, 100%)", background: DS.bgSide, border: `1px solid ${DS.textHint}`,
          borderRadius: 16, padding: 24, color: DS.textPrimary }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{accion.titulo}</h3>
        <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.55, color: DS.textSecondary }}>{accion.detalle}</p>
        {accion.aviso && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, lineHeight: 1.5, color: DS.amber, fontWeight: 600 }}>{accion.aviso}</p>
        )}
        {accion.escribir && (
          <label style={{ display: "block", marginTop: 16 }}>
            <span style={{ display: "block", fontSize: 12.5, color: DS.textSecondary, marginBottom: 7 }}>
              Escribí <b style={{ color: DS.textPrimary }}>{accion.escribir}</b> para confirmar
            </span>
            <input
              value={tecleado}
              onChange={(e) => setTecleado(e.target.value)}
              autoFocus
              placeholder={accion.escribir}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10,
                border: `1px solid ${DS.textHint}`, background: "transparent", color: DS.textPrimary,
                fontFamily: DS.font, fontSize: 13.5, outline: "none" }} />
          </label>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" onClick={onCancel}
            style={{ padding: "9px 16px", borderRadius: 10, cursor: "pointer", fontFamily: DS.font, fontSize: 13, fontWeight: 600,
              background: "transparent", border: `1px solid ${DS.textHint}`, color: DS.textSecondary }}>
            Cancelar
          </button>
          <button type="button" onClick={() => { onCancel?.(); accion.onOk?.(); }}
            disabled={!!accion.escribir && tecleado.trim() !== accion.escribir}
            style={{ padding: "9px 18px", borderRadius: 10, fontFamily: DS.font, fontSize: 13, fontWeight: 700,
              background: accion.peligro ? DS.red : DS.blue, border: "none", color: "#fff",
              opacity: (!!accion.escribir && tecleado.trim() !== accion.escribir) ? 0.4 : 1,
              cursor: (!!accion.escribir && tecleado.trim() !== accion.escribir) ? "not-allowed" : "pointer" }}>
            {accion.ok || "Continuar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DS } from "./design.js";

// Modo Censurar — toggle global para grabar tutoriales sin exponer nombres
// reales de clientes. Cuando está ON:
//   - Los nombres de empresa se reemplazan por "Cliente A", "Cliente B"…
//     (consistente por slug, así una misma empresa siempre es el mismo label)
//   - Las iniciales de avatar también se enmascaran a "C"
//
// Persiste en localStorage para que el toggle no se resetee al refrescar
// (importante mientras el user está grabando).

const STORAGE_KEY = "inforce_censor_mode";
const CensorContext = createContext(null);

// Asignación deterministica slug → letra. Hash simple para que la misma
// empresa siempre tenga el mismo label en una sesión.
const labelCache = new Map();
function letterFor(key) {
  if (!key) return "X";
  if (labelCache.has(key)) return labelCache.get(key);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const letter = String.fromCharCode(65 + (h % 26)); // A-Z
  labelCache.set(key, letter);
  return letter;
}

export function CensorProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; }
    catch { return false; }
  });

  const toggle = useCallback(() => {
    setEnabled((v) => {
      const next = !v;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // Cross-tab sync: si abrís 2 tabs y togglás en una, la otra se actualiza.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setEnabled(e.newValue === "1");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <CensorContext.Provider value={{ enabled, toggle }}>
      {children}
    </CensorContext.Provider>
  );
}

export function useCensor() {
  return useContext(CensorContext) || { enabled: false, toggle: () => {} };
}

// Enmascara un nombre de empresa. `key` opcional (slug/id) para que la
// misma empresa siempre devuelva el mismo label "Cliente X".
export function maskCompanyName(name, enabled, key = null) {
  if (!enabled) return name || "";
  const k = key || name || "";
  return `Cliente ${letterFor(k)}`;
}

// Enmascara una inicial / charAt(0). En modo censor siempre devuelve "C".
export function maskInitial(name, enabled, key = null) {
  if (!enabled) return (name || "?").charAt(0).toUpperCase();
  const k = key || name || "";
  return letterFor(k);
}

// Hook helper — devuelve funciones ya bindeadas al estado actual.
export function useCompanyMask() {
  const { enabled } = useCensor();
  return {
    enabled,
    name: (n, key) => maskCompanyName(n, enabled, key),
    initial: (n, key) => maskInitial(n, enabled, key),
  };
}

// Botón toggle reutilizable. Se renderiza donde el caller lo ponga.
export function CensorButton({ size = "sm", showLabel = true, style = {} }) {
  const { enabled, toggle } = useCensor();
  const padding = size === "sm" ? "5px 10px" : "7px 14px";
  const fontSize = size === "sm" ? 11 : 12;
  return (
    <button
      onClick={toggle}
      title={enabled ? "Mostrar nombres reales" : "Censurar nombres (para grabar tutoriales)"}
      style={{
        padding,
        borderRadius: 50,
        border: enabled
          ? "1px solid rgba(245,166,35,0.55)"
          : `1px solid ${DS.textHint}`,
        background: enabled ? "rgba(245,166,35,0.15)" : "transparent",
        color: enabled ? "#F5A623" : DS.textSecondary,
        fontSize, fontWeight: 700,
        cursor: "pointer", fontFamily: DS.font,
        display: "inline-flex", alignItems: "center", gap: 5,
        transition: "background 120ms ease, border-color 120ms ease",
        ...style,
      }}
    >
      <span style={{ fontSize: 12 }}>{enabled ? "👁‍🗨" : "👁"}</span>
      {showLabel && <span>{enabled ? "Censurado" : "Censurar"}</span>}
    </button>
  );
}

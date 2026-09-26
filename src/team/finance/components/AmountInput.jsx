import { useEffect, useRef, useState } from "react";
import { DS, darkInput } from "../../../lib/design.js";
import { parseCOP } from "../lib/finance_math.js";

// Input de monto en COP con formateo en vivo. Devuelve un number via onChange.
// Internamente mantiene un string formateado para el display.
export function AmountInput({ value, onChange, autoFocus = false, placeholder = "0", style = {} }) {
  const [display, setDisplay] = useState(value ? Number(value).toLocaleString("es-CO") : "");
  const inputRef = useRef(null);

  useEffect(() => {
    // Sync externa (ej. resetear el form). Solo si el number difiere del display.
    const currentNum = parseCOP(display);
    if (Number(value || 0) !== currentNum) {
      setDisplay(value ? Number(value).toLocaleString("es-CO") : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    // Permitir solo dígitos.
    const clean = raw.replace(/[^\d]/g, "");
    const num = Number(clean || 0);
    setDisplay(num ? num.toLocaleString("es-CO") : "");
    onChange?.(num);
  };

  return (
    <div style={{ position: "relative" }}>
      <span style={{
        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
        color: DS.textSecondary, fontSize: 13, fontWeight: 600, pointerEvents: "none",
      }}>$</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={{ ...darkInput, paddingLeft: 26, fontVariantNumeric: "tabular-nums", ...style }}
      />
    </div>
  );
}

// Dropdown reusable click-to-open con lista vertical.
// Cierra al click outside o ESC.

import { useEffect, useRef, useState } from "react";
import { DS, withAlpha } from "../../../lib/design.js";

export function DropdownMenu({ trigger, items, onSelect, activeKey, align = "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const t = setTimeout(() => document.addEventListener("mousedown", onClickOutside), 50);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {trigger({ open, onClick: () => setOpen((v) => !v) })}
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          [align]: 0,
          background: DS.bgSide,
          border: `1px solid ${withAlpha(DS.textHint, "55")}`,
          borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          padding: 6,
          minWidth: 220,
          zIndex: 9999,
          fontFamily: DS.font,
        }}>
          {items.map((item) => {
            const isActive = item.key === activeKey;
            return (
              <button
                key={item.key}
                onClick={() => { onSelect?.(item.key); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "8px 12px", borderRadius: 8,
                  border: "none",
                  background: isActive ? withAlpha(DS.green, "18") : "transparent",
                  color: isActive ? DS.textPrimary : DS.textSecondary,
                  fontSize: 12, fontWeight: 500, textAlign: "left",
                  cursor: "pointer", fontFamily: DS.font,
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
              >
                {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

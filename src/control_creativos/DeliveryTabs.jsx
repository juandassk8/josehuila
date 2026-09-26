// Tab strip al pie estilo Google Sheets — un tab por entrega.
import { useEffect, useRef, useState } from "react";

export function DeliveryTabs({
  deliveries,
  activeDeliveryId,
  getLabel,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  isDark,
  T,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [menuFor, setMenuFor] = useState(null); // delivery id whose ⌄ menu is open
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuFor) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuFor(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  const startRename = (d) => {
    setEditingId(d.id);
    setDraft(getLabel(d));
    setMenuFor(null);
  };

  const commitRename = () => {
    if (editingId) {
      onRename(editingId, draft);
      setEditingId(null);
    }
  };

  const tabBg = isDark ? "#16161E" : "#F1F3F4";
  const tabActiveBg = isDark ? "#0E0E14" : "#FFFFFF";
  const tabBorder = isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid #DADCE0";

  return (
    <div style={{
      borderTop: tabBorder,
      background: isDark ? "#0A0A10" : "#F8F9FA",
      display: "flex", alignItems: "stretch", padding: "0 8px",
      overflowX: "auto", minHeight: 36,
      fontFamily: T.font,
    }}>
      {/* Botón + a la izquierda */}
      <button
        onClick={onCreate}
        title="Nueva entrega"
        style={{
          background: "transparent", border: "none", color: T.textSecondary,
          cursor: "pointer", fontSize: 18, padding: "0 12px", fontWeight: 400,
        }}
      >+</button>

      {deliveries.map((d) => {
        const isActive = d.id === activeDeliveryId;
        const isEditing = editingId === d.id;
        const label = getLabel(d);

        return (
          <div
            key={d.id}
            onClick={() => !isEditing && onSelect(d.id)}
            onDoubleClick={() => startRename(d)}
            style={{
              position: "relative",
              padding: "0 12px",
              minWidth: 140, maxWidth: 280,
              display: "flex", alignItems: "center", gap: 4,
              background: isActive ? tabActiveBg : tabBg,
              borderTop: isActive ? `2px solid ${T.green || "#1D9E75"}` : "2px solid transparent",
              borderRight: tabBorder,
              borderLeft: tabBorder,
              cursor: isEditing ? "text" : "pointer",
              fontSize: 12, fontWeight: isActive ? 700 : 500,
              color: isActive ? T.textPrimary : T.textSecondary,
              marginRight: -1,
            }}
          >
            {isEditing ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") { setEditingId(null); setDraft(""); }
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: "transparent", border: `1px solid ${T.textHint}`,
                  borderRadius: 4, padding: "2px 6px",
                  fontSize: 12, color: T.textPrimary,
                  fontFamily: T.font, outline: "none",
                  width: "100%",
                }}
              />
            ) : (
              <>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === d.id ? null : d.id); }}
                  style={{
                    background: "transparent", border: "none", color: T.textMuted,
                    cursor: "pointer", fontSize: 10, padding: "2px 4px",
                    visibility: isActive ? "visible" : "hidden",
                  }}
                >▾</button>

                {menuFor === d.id && (
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: "absolute", bottom: "calc(100% + 4px)", left: 0,
                      background: isDark ? "#16161E" : "#FFFFFF",
                      border: tabBorder, borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                      minWidth: 160, padding: 4, zIndex: 100,
                    }}
                  >
                    <MenuItem onClick={() => startRename(d)} T={T}>Renombrar</MenuItem>
                    <MenuItem onClick={() => { onDelete(d.id); setMenuFor(null); }} T={T} danger>
                      Eliminar
                    </MenuItem>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MenuItem({ children, onClick, T, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: "transparent", border: "none",
        padding: "8px 12px", borderRadius: 4,
        fontSize: 12, fontWeight: 500,
        color: danger ? "#E24B4A" : T.textPrimary,
        cursor: "pointer", fontFamily: T.font,
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = "rgba(127,127,127,0.10)"}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >{children}</button>
  );
}

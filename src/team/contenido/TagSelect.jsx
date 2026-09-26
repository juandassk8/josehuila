import { useState, useRef, useEffect } from "react";
import { DS } from "../../lib/design.js";

// Tag colors — default uses DS for theme awareness
export const TAG_COLORS = {
  default: { get bg() { return DS.bgCard; }, get text() { return DS.textSecondary; } },
  gray:    { bg: "rgba(155,155,155,0.2)", text: "#9b9b9b" },
  brown:   { bg: "rgba(186,133,83,0.2)", text: "#BA8553" },
  orange:  { bg: "rgba(245,166,35,0.2)", text: "#F5A623" },
  yellow:  { bg: "rgba(233,196,53,0.2)", text: "#E9C435" },
  green:   { bg: "rgba(29,185,122,0.2)", text: "#1DB97A" },
  blue:    { bg: "rgba(55,138,221,0.2)", text: "#378ADD" },
  purple:  { bg: "rgba(139,92,246,0.2)", text: "#8B5CF6" },
  pink:    { bg: "rgba(236,72,153,0.2)", text: "#EC4899" },
  red:     { bg: "rgba(226,75,74,0.2)", text: "#E24B4A" },
};

const COLOR_NAMES = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export function getTagStyle(colorName) {
  return TAG_COLORS[colorName] || TAG_COLORS.default;
}

// TagPill — renders a single colored tag pill
export function TagPill({ label, color, onRemove, small }) {
  const style = getTagStyle(color);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: small ? "2px 7px" : "3px 10px",
      borderRadius: 50, background: style.bg, color: style.text,
      fontSize: small ? 10 : 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {label}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} style={{
          background: "transparent", border: "none", color: style.text,
          cursor: "pointer", fontSize: small ? 10 : 12, padding: 0, opacity: 0.6,
          lineHeight: 1,
        }}>×</button>
      )}
    </span>
  );
}

// TagSelect — Notion-style multi/single select with create, edit, delete, color picker
export function TagSelect({
  options,            // array from useTagOptions
  selected,           // array of labels (multi) or string (single)
  onChange,            // (newSelected) => void
  onCreateOption,     // (label, color) => Promise
  onUpdateOption,     // (id, patch) => Promise
  onDeleteOption,     // (id) => Promise
  multi = true,
  placeholder = "Select or create…",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  const selectedArr = multi
    ? (Array.isArray(selected) ? selected : [])
    : (selected ? [selected] : []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()) && !selectedArr.includes(o.label)
  );
  const canCreate = search.trim() && !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (label) => {
    if (multi) {
      onChange([...selectedArr, label]);
    } else {
      onChange(label);
      setOpen(false);
    }
    setSearch("");
  };

  const handleRemove = (label) => {
    if (multi) {
      onChange(selectedArr.filter((l) => l !== label));
    } else {
      onChange("");
    }
  };

  const handleCreate = async () => {
    const label = search.trim();
    if (!label) return;
    await onCreateOption?.(label, "default");
    handleSelect(label);
    setSearch("");
  };

  const startEdit = (opt, e) => {
    e.stopPropagation();
    setEditingId(opt.id);
    setEditLabel(opt.label);
  };

  const saveEdit = async (opt) => {
    if (editLabel.trim() && editLabel.trim() !== opt.label) {
      // Update in selected too
      const oldLabel = opt.label;
      const newLabel = editLabel.trim();
      await onUpdateOption?.(opt.id, { label: newLabel });
      if (selectedArr.includes(oldLabel)) {
        const newSelected = selectedArr.map((l) => (l === oldLabel ? newLabel : l));
        onChange(multi ? newSelected : newSelected[0] || "");
      }
    }
    setEditingId(null);
  };

  const handleDelete = async (opt) => {
    await onDeleteOption?.(opt.id);
    handleRemove(opt.label);
    setEditingId(null);
  };

  const handleColorChange = async (opt, color) => {
    await onUpdateOption?.(opt.id, { color });
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Selected tags + input */}
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
          minHeight: 34, padding: "4px 8px", cursor: "text",
          borderRadius: 8, border: DS.border,
          background: open ? DS.bgCard : "transparent",
          transition: "background 0.15s",
        }}
      >
        {selectedArr.map((label) => {
          const opt = options.find((o) => o.label === label);
          return (
            <TagPill key={label} label={label} color={opt?.color || "default"} onRemove={() => handleRemove(label)} />
          );
        })}
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedArr.length === 0 ? placeholder : ""}
          style={{
            flex: 1, minWidth: 80, background: "transparent", border: "none", outline: "none",
            color: DS.textPrimary, fontSize: 13, fontFamily: DS.font, padding: "4px 0",
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: DS.bgSide, border: DS.border,
          borderRadius: 10, padding: 6, zIndex: 200,
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)", maxHeight: 320, overflowY: "auto",
        }}>
          <div style={{ fontSize: 10, color: DS.textMuted, padding: "4px 8px 6px", letterSpacing: "0.08em" }}>
            Select an option or create one
          </div>

          {/* Selected items (shown at top for context) */}
          {selectedArr.length > 0 && (
            <div style={{ padding: "0 4px 6px", borderBottom: DS.border, marginBottom: 4 }}>
              {selectedArr.map((label) => {
                const opt = options.find((o) => o.label === label);
                return (
                  <OptionRow key={`sel-${label}`} opt={opt || { label, color: "default" }}
                    selected onToggle={() => handleRemove(label)}
                    onStartEdit={startEdit} editingId={editingId} editLabel={editLabel}
                    setEditLabel={setEditLabel} onSaveEdit={saveEdit}
                    onDelete={handleDelete} onColorChange={handleColorChange} />
                );
              })}
            </div>
          )}

          {/* Available options */}
          {filtered.map((opt) => (
            <OptionRow key={opt.id} opt={opt} selected={false}
              onToggle={() => handleSelect(opt.label)}
              onStartEdit={startEdit} editingId={editingId} editLabel={editLabel}
              setEditLabel={setEditLabel} onSaveEdit={saveEdit}
              onDelete={handleDelete} onColorChange={handleColorChange} />
          ))}

          {/* Create new */}
          {canCreate && (
            <button onClick={handleCreate} style={{
              width: "100%", padding: "8px 10px", borderRadius: 6, border: "none",
              background: "transparent", cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", gap: 6, color: DS.textPrimary, fontSize: 12,
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: DS.textMuted }}>Create</span>
              <TagPill label={search.trim()} color="default" small />
            </button>
          )}

          {filtered.length === 0 && !canCreate && selectedArr.length === 0 && (
            <div style={{ padding: "12px 8px", color: DS.textMuted, fontSize: 11, textAlign: "center" }}>
              No hay opciones todavía.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OptionRow({ opt, selected, onToggle, onStartEdit, editingId, editLabel, setEditLabel, onSaveEdit, onDelete, onColorChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const style = getTagStyle(opt.color);
  const isEditing = editingId === opt.id;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6, padding: "4px 6px",
      borderRadius: 6, cursor: "pointer", position: "relative",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = DS.bgCard; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; setShowMenu(false); }}
    >
      {/* Drag handle (visual only for now) */}
      <span style={{ color: DS.textHint, fontSize: 10, cursor: "grab", userSelect: "none" }}>⠿</span>

      {/* Tag pill */}
      <div onClick={onToggle} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <TagPill label={opt.label} color={opt.color} small />
        {selected && <span style={{ color: DS.green, fontSize: 11 }}>✓</span>}
      </div>

      {/* Three dots menu */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
        style={{
          background: "transparent", border: "none", color: DS.textMuted,
          cursor: "pointer", fontSize: 14, padding: "2px 4px", borderRadius: 4,
          opacity: 0.5,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; }}
      >
        ⋯
      </button>

      {/* Context menu (rename, delete, colors) */}
      {showMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", right: 0, top: "100%", marginTop: 2,
            background: DS.bgSide, border: DS.border,
            borderRadius: 10, padding: 8, zIndex: 300, width: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Rename */}
          {isEditing ? (
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <input
                autoFocus
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { onSaveEdit(opt); setShowMenu(false); } }}
                style={{
                  flex: 1, background: DS.bgCard, border: DS.border,
                  borderRadius: 6, padding: "4px 8px", color: DS.textPrimary, fontSize: 12,
                  fontFamily: DS.font, outline: "none",
                }}
              />
              <button onClick={() => { onSaveEdit(opt); setShowMenu(false); }}
                style={{ background: DS.blue, border: "none", borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                ✓
              </button>
            </div>
          ) : (
            <button onClick={(e) => onStartEdit(opt, e)}
              style={menuItem}>
              ✏️ Renombrar
            </button>
          )}

          <button onClick={() => { onDelete(opt); setShowMenu(false); }}
            style={{ ...menuItem, color: DS.red }}>
            🗑 Eliminar
          </button>

          <div style={{ borderTop: DS.border, margin: "6px 0", paddingTop: 6 }}>
            <div style={{ fontSize: 10, color: DS.textMuted, marginBottom: 6, letterSpacing: "0.08em" }}>COLORS</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {COLOR_NAMES.map((c) => {
                const cs = TAG_COLORS[c];
                return (
                  <button
                    key={c}
                    onClick={() => { onColorChange(opt, c); }}
                    title={c}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: cs.text === "rgba(255,255,255,0.7)" ? DS.textMuted : cs.text,
                      border: opt.color === c ? `2px solid ${DS.textPrimary}` : "2px solid transparent",
                      cursor: "pointer", padding: 0,
                      boxShadow: opt.color === c ? `0 0 0 2px ${cs.text}44` : "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItem = {
  display: "block", width: "100%", padding: "6px 8px", borderRadius: 6,
  border: "none", background: "transparent", cursor: "pointer",
  textAlign: "left", color: DS.textPrimary, fontSize: 12, fontFamily: DS.font,
};

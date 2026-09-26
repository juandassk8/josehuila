import { useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { CONTENT_STATUS_LABEL, STORY_CATEGORIES } from "./ContentCard.jsx";
import { Topbar } from "../layout/Topbar.jsx";
import { createContentItem } from "../data/contentDb.js";
import { canCreateContent } from "../lib/permissions.js";
import { useTagOptions } from "../hooks/useTagOptions.js";
import { getTagStyle } from "./TagSelect.jsx";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, format,
  isSameMonth, isSameDay, addMonths, subMonths,
} from "date-fns";
import { es } from "date-fns/locale";

// Cada tab tiene su propio filtro y su propia fuente de fecha.
// - contenido: items para publicar (excluye to_edit), fecha de publicación
// - historias: stories, fecha de publicación
// - edicion:  items en edición (to_film / to_edit), fecha de edición,
//             filtrada por editor actual cuando el rol es editor
const CALENDAR_TABS = [
  {
    key: "contenido",
    label: "📅 Contenido",
    dateField: "scheduled_date",
    filter: (i) => (i.kind === "video" || i.kind === "post") && i.status !== "to_edit",
  },
  {
    key: "historias",
    label: "📱 Historias",
    dateField: "scheduled_date",
    filter: (i) => i.kind === "story",
  },
  {
    key: "edicion",
    label: "✂️ Edición",
    dateField: "edit_due_date",
    filter: (i, { editorId } = {}) => {
      if (!["to_film", "to_edit"].includes(i.status)) return false;
      if (editorId && i.assigned_editor_id !== editorId) return false;
      return true;
    },
  },
];

export function ContentCalendar({ items, members, currentMember, onOpenItem, activeTab: activeTabProp, onTabChange }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  // Controlled si el padre provee activeTab + onTabChange; si no, uncontrolled con state local.
  const [activeTabState, setActiveTabState] = useState("contenido");
  const activeTab = activeTabProp ?? activeTabState;
  const setActiveTab = (t) => {
    if (onTabChange) onTabChange(t);
    else setActiveTabState(t);
  };
  const [expandedDay, setExpandedDay] = useState(null);
  const canCreate = canCreateContent(currentMember);

  // Tags de tipo_story para renderizar la pill por tipo en historias.
  const tipoStoryTags = useTagOptions("tipo_story");

  const viewDef = CALENDAR_TABS.find((t) => t.key === activeTab) || CALENDAR_TABS[0];

  // Si el usuario es editor, en el tab de Edición filtra solo sus items.
  const editorId = (currentMember?.role === "editor" && activeTab === "edicion") ? currentMember.id : null;

  const filtered = useMemo(
    () => (items || [])
      .filter((i) => viewDef.filter(i, { editorId }))
      .filter((i) => i[viewDef.dateField]),
    [items, viewDef, editorId]
  );

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    const rows = [];
    let day = calStart;
    while (day <= calEnd) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(day));
        day = addDays(day, 1);
      }
      rows.push(week);
    }
    return rows;
  }, [currentDate]);

  const itemsByDate = useMemo(() => {
    const map = {};
    const df = viewDef.dateField;
    filtered.forEach((item) => {
      const key = item[df];
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [filtered, viewDef]);

  const today = new Date();

  const handleAddItem = async (dateStr) => {
    const defaultKind = activeTab === "historias" ? "story" : "video";
    const dateField = viewDef.dateField;
    const { data } = await createContentItem({
      title: "Sin título",
      kind: defaultKind,
      status: "idea",
      [dateField]: dateStr,
      created_by: currentMember?.id,
    });
    if (data) onOpenItem?.(data);
  };

  return (
    <div style={{ fontFamily: DS.font }}>
      <Topbar title="📅 Calendario" subtitle="Contenido, historias y edición" accent={DS.purple} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, padding: 4, background: DS.bgCard, borderRadius: 10, border: DS.border }}>
          {CALENDAR_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedDay(null); }}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: activeTab === tab.key ? DS.bgCard : "transparent",
                color: activeTab === tab.key ? DS.textPrimary : DS.textSecondary,
                fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 500,
                transition: "background 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} style={navBtn}>◀</button>
          <div style={{ fontSize: 15, fontWeight: 700, color: DS.textPrimary, minWidth: 160, textAlign: "center", textTransform: "capitalize" }}>
            {format(currentDate, "MMMM yyyy", { locale: es })}
          </div>
          <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} style={navBtn}>▶</button>
          <button onClick={() => setCurrentDate(new Date())} style={{ ...navBtn, fontSize: 10, fontWeight: 700, padding: "6px 14px" }}>Hoy</button>
        </div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1,
        background: DS.bgCard, borderRadius: 14, overflow: "hidden",
        border: DS.border,
      }}>
        {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
          <div key={d} style={{
            padding: "8px 0", textAlign: "center", fontSize: 10, fontWeight: 700,
            color: DS.textMuted, letterSpacing: "0.1em", textTransform: "uppercase",
            background: DS.bgCard,
          }}>
            {d}
          </div>
        ))}

        {weeks.flatMap((week) =>
          week.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayItems = itemsByDate[dateStr] || [];
            const isToday_ = isSameDay(day, today);
            const inMonth = isSameMonth(day, currentDate);
            const isExpanded = expandedDay === dateStr;
            const visibleItems = isExpanded ? dayItems : dayItems.slice(0, 3);

            return (
              <div
                key={dateStr}
                className="calendar-day"
                style={{
                  minHeight: 100,
                  padding: "6px 5px",
                  position: "relative",
                  background: isToday_ ? "rgba(55,138,221,0.06)" : "transparent",
                  opacity: inMonth ? 1 : 0.35,
                  borderTop: DS.border,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 2px" }}>
                  <div style={{
                    fontSize: 11, fontWeight: isToday_ ? 700 : 500,
                    color: isToday_ ? DS.blue : DS.textSecondary,
                  }}>
                    {isToday_ ? (
                      <span style={{ background: DS.blue, color: "#fff", padding: "2px 7px", borderRadius: 50, fontSize: 10 }}>
                        {format(day, "d")}
                      </span>
                    ) : format(day, "d")}
                  </div>
                  {inMonth && canCreate && (
                    <button
                      onClick={() => handleAddItem(dateStr)}
                      title="Agregar item"
                      style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: "transparent", border: DS.border,
                        color: DS.textMuted, cursor: "pointer", fontSize: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: 0, transition: "opacity 0.15s",
                      }}
                      className="add-btn"
                    >
                      +
                    </button>
                  )}
                </div>

                {visibleItems.map((item) => {
                  const isHistoria = activeTab === "historias";
                  const statusDotColors = {
                    idea: "#9b9b9b", scripting: "#378ADD", to_film: "#E24B4A",
                    to_edit: "#EC4899", to_post: "#E9C435", posted: "#1DB97A",
                  };
                  const dotColor = statusDotColors[item.status] || "#9b9b9b";

                  // Para historias: mostrar el tipo elegido (Conexión, Autoridad, etc.)
                  // en vez del status de idea/scripting/etc., usando el color del tag_option.
                  let tipoBadge = null;
                  if (isHistoria) {
                    const tipoLabel = item.tipo || item.story_category || null;
                    if (tipoLabel) {
                      const tagOpt = (tipoStoryTags.options || []).find((o) => o.label === tipoLabel);
                      const ts = getTagStyle(tagOpt?.color || "default");
                      tipoBadge = { label: tipoLabel, color: ts.text, bg: ts.bg };
                    }
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={() => onOpenItem?.(item)}
                      style={{
                        width: "100%", textAlign: "left", display: "block",
                        padding: "6px 8px", borderRadius: 6, marginBottom: 4,
                        background: DS.bgCard,
                        border: DS.border,
                        cursor: "pointer", overflow: "hidden",
                      }}
                    >
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: DS.textPrimary,
                        lineHeight: 1.3, marginBottom: 4,
                        display: "-webkit-box", WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical", overflow: "hidden",
                      }}>
                        {item.title}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {tipoBadge ? (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: tipoBadge.color,
                            background: tipoBadge.bg, padding: "2px 8px",
                            borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: tipoBadge.color }} />
                            {tipoBadge.label}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 10, fontWeight: 600, color: dotColor,
                            background: dotColor + "18", padding: "2px 8px",
                            borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 4,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }} />
                            {isHistoria ? "Sin tipo" : CONTENT_STATUS_LABEL[item.status]}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}

                {dayItems.length > 3 && (
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : dateStr)}
                    style={{
                      width: "100%", textAlign: "center",
                      fontSize: 10, color: DS.purple, fontWeight: 600,
                      background: "transparent", border: "none", cursor: "pointer",
                      padding: "4px 2px", marginTop: 2, fontFamily: DS.font,
                    }}
                  >
                    {isExpanded
                      ? `− Ocultar (${dayItems.length})`
                      : `+${dayItems.length - 3} más`}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .calendar-day:hover .add-btn { opacity: 1 !important; }
        .calendar-day:hover .add-btn:hover { background: ${DS.bgCard} !important; color: ${DS.textPrimary} !important; }
      `}</style>
    </div>
  );
}

const navBtn = {
  padding: "7px 12px", borderRadius: 50,
  border: DS.border,
  background: "transparent", color: DS.textSecondary,
  cursor: "pointer", fontSize: 13, fontWeight: 600,
};

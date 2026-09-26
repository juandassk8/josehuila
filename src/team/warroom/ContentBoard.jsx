import { useEffect, useMemo, useState } from "react";
import { DS } from "../../lib/design.js";
import { ContentPipeline } from "../contenido/ContentPipeline.jsx";
import { ContentDetailPage } from "../contenido/ContentDetailPage.jsx";
import { ContentCalendar } from "../contenido/ContentCalendar.jsx";
import { ColumnFilter } from "./ColumnFilter.jsx";
import { useTagOptions } from "../hooks/useTagOptions.js";
import { usePathRoute } from "../../lib/router.jsx";

// Default de columnas según rol.
const DEFAULT_COLUMNS_BY_ROLE = {
  editor: ["to_film", "to_edit", "to_post"],
  admin: ["idea", "scripting", "to_film", "to_edit", "to_post", "posted"],
  member: ["idea", "scripting", "to_film", "to_edit", "to_post", "posted"],
};

const SUB_TABS = [
  { key: "board", label: "📋 Board" },
  { key: "calendar", label: "📅 Calendar" },
];

export function ContentBoard({ items, members, currentMember }) {
  const isEditor = currentMember?.role === "editor";
  const subStorageKey = `contentBoard:subTab:${currentMember?.id || "anon"}`;
  const defaultSubTab = isEditor ? "calendar" : "board";

  // URL: #/warroom/content/<sub> (+ opcionalmente #/warroom/content/calendar/<calSub>)
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const urlSub = segments[2];
  const isValidSub = SUB_TABS.some((t) => t.key === urlSub);

  // Default limpio al entrar — filtros durante sesión sí, entre sesiones no.
  const [fallbackSub, setFallbackSub] = useState(defaultSubTab);
  const subTab = isValidSub ? urlSub : fallbackSub;
  const switchSubTab = (k) => {
    navigate(`/warroom/content/${k}`);
    setFallbackSub(k);
  };
  void subStorageKey;

  // Sub-tab del calendar cuando estamos en content/calendar
  const calendarSubTab = subTab === "calendar" ? (segments[3] || "contenido") : "contenido";
  const setCalendarSubTab = (st) => navigate(`/warroom/content/calendar/${st}`);

  // Kind filter cuando estamos en content/board
  const validKinds = ["all", "video", "story", "post"];
  const kindFilter = subTab === "board" && validKinds.includes(segments[3]) ? segments[3] : "all";
  const setKindFilter = (k) => navigate(`/warroom/content/board/${k}`);

  const formatoTags = useTagOptions("formato");
  const tipoTags = useTagOptions("tipo");
  const tipoStoryTags = useTagOptions("tipo_story");
  const allTagOptions = useMemo(
    () => [...formatoTags.options, ...tipoTags.options, ...tipoStoryTags.options],
    [formatoTags.options, tipoTags.options, tipoStoryTags.options]
  );

  const defaultColumns = DEFAULT_COLUMNS_BY_ROLE[currentMember?.role] || DEFAULT_COLUMNS_BY_ROLE.admin;
  const storageKey = `contentBoard:columns:${currentMember?.id || "anon"}`;

  const [visibleStatuses, setVisibleStatuses] = useState(defaultColumns);
  const [selectedItem, setSelectedItem] = useState(null);

  if (selectedItem) {
    const latestItem = (items || []).find((i) => i.id === selectedItem.id) || selectedItem;
    return (
      <ContentDetailPage
        item={latestItem}
        members={members}
        currentMember={currentMember}
        onBack={() => setSelectedItem(null)}
        onSaved={() => setSelectedItem(null)}
      />
    );
  }

  const itemsForCount = (items || []).filter((i) => visibleStatuses.includes(i.status));

  return (
    <div>
      {/* Sub-tabs Board / Calendar */}
      <div style={{
        display: "flex", gap: 4, padding: 3,
        background: DS.bgCard, border: DS.border, borderRadius: 10,
        width: "fit-content", marginBottom: 14,
      }}>
        {SUB_TABS.map((t) => {
          const active = subTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => switchSubTab(t.key)}
              style={{
                padding: "7px 14px", borderRadius: 8, border: "none",
                background: active ? DS.bgSide : "transparent",
                color: active ? DS.textPrimary : DS.textSecondary,
                fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: "pointer", fontFamily: DS.font,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "board" && (
        <ContentPipeline
          items={items}
          members={members}
          currentMember={currentMember}
          onOpenItem={(item) => setSelectedItem(item)}
          tagOptions={allTagOptions}
          visibleStatuses={visibleStatuses}
          showTopbar={true}
          title="Content Board"
          subtitle={`${itemsForCount.length} items visibles · @josehuilaa`}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
          extraTopbarActions={
            <ColumnFilter
              storageKey={storageKey}
              defaultSelected={defaultColumns}
              onChange={setVisibleStatuses}
            />
          }
        />
      )}

      {subTab === "calendar" && (
        <ContentCalendar
          items={items}
          members={members}
          currentMember={currentMember}
          onOpenItem={(item) => setSelectedItem(item)}
          activeTab={calendarSubTab}
          onTabChange={setCalendarSubTab}
        />
      )}
    </div>
  );
}

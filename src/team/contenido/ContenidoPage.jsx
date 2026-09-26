import { useState, useMemo } from "react";
import { DS } from "../../lib/design.js";
import { ContentPipeline } from "./ContentPipeline.jsx";
import { ContentCalendar } from "./ContentCalendar.jsx";
import { PostedTable } from "./PostedTable.jsx";
import { ContentDetailPage } from "./ContentDetailPage.jsx";
import { ContentModal } from "./ContentModal.jsx";
import { useTagOptions } from "../hooks/useTagOptions.js";
import { GuionesPage } from "../guiones/GuionesPage.jsx";
import { usePathRoute } from "../../lib/router.jsx";
import { canAccessView } from "../lib/permissions.js";

const TABS = [
  { key: "board",    label: "📋 Board" },
  { key: "calendar", label: "📅 Calendar" },
  { key: "posted",   label: "📊 Posted" },
  { key: "guiones",  label: "✍️ Guiones" },
];

export function ContenidoPage({ items, members, currentMember, onReload }) {
  // URL: #/contenido/<tab>/<sub>
  const { segments, navigate } = usePathRoute({ prefix: "/equipo" });
  const validKeys = TABS.map((t) => t.key);
  const tab = validKeys.includes(segments[1]) ? segments[1] : "board";
  const setTab = (t) => navigate(`/contenido/${t}`);

  // Sub-tab del calendar (sólo aplica cuando tab === "calendar")
  const calendarSubTab = tab === "calendar" ? (segments[2] || "contenido") : "contenido";
  const setCalendarSubTab = (st) => navigate(`/contenido/calendar/${st}`);

  // Kind filter del board (all | video | story | post)
  const validKinds = ["all", "video", "story", "post"];
  const kindFilter = tab === "board" && validKinds.includes(segments[2]) ? segments[2] : "all";
  const setKindFilter = (k) => navigate(`/contenido/board/${k}`);

  const [selectedItem, setSelectedItem] = useState(null);
  const [creating, setCreating] = useState(false);
  const formatoTags = useTagOptions("formato");
  const tipoTags = useTagOptions("tipo");
  const tipoStoryTags = useTagOptions("tipo_story");
  const allTagOptions = useMemo(
    () => [...formatoTags.options, ...tipoTags.options, ...tipoStoryTags.options],
    [formatoTags.options, tipoTags.options, tipoStoryTags.options]
  );

  const handleOpenItem = (item) => {
    setSelectedItem(item);
  };

  const handleBack = () => {
    setSelectedItem(null);
  };

  // Nota: NO cerramos el detalle cuando se guarda — el user quiere seguir
  // editando. Antes se cerraba y volvía a la lista → perdía el contexto.
  // El reload refresca items; ContentDetailPage resyncea vía useEffect.
  const handleSaved = () => {
    onReload?.();
  };

  // If an item is selected, show the Notion-style detail page
  if (selectedItem) {
    // Find the latest version from items list (realtime may have updated it)
    const latestItem = (items || []).find((i) => i.id === selectedItem.id) || selectedItem;
    return (
      <ContentDetailPage
        item={latestItem}
        members={members}
        currentMember={currentMember}
        onBack={handleBack}
        onSaved={handleSaved}
      />
    );
  }

  return (
    <div style={{ fontFamily: DS.font }}>
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        padding: 4,
        background: DS.bgCard,
        borderRadius: 14,
        border: DS.border,
        width: "fit-content",
      }}>
        {TABS.filter((t) => t.key !== "guiones" || canAccessView(currentMember, "guiones")).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: tab === t.key ? DS.bgCard : "transparent",
              color: tab === t.key ? DS.textPrimary : DS.textSecondary,
              fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              cursor: "pointer", transition: "background 0.15s, color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "board" && (
        <ContentPipeline
          items={items}
          members={members}
          currentMember={currentMember}
          onOpenItem={handleOpenItem}
          tagOptions={allTagOptions}
          kindFilter={kindFilter}
          onKindFilterChange={setKindFilter}
        />
      )}
      {tab === "calendar" && (
        <ContentCalendar
          items={items}
          members={members}
          currentMember={currentMember}
          onOpenItem={handleOpenItem}
          activeTab={calendarSubTab}
          onTabChange={setCalendarSubTab}
        />
      )}
      {tab === "posted" && (
        <PostedTable items={items} members={members} currentMember={currentMember} />
      )}
      {tab === "guiones" && (
        <GuionesPage contentItems={items} />
      )}

      {creating && (
        <ContentModal
          members={members}
          currentMember={currentMember}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); onReload?.(); }}
        />
      )}
    </div>
  );
}

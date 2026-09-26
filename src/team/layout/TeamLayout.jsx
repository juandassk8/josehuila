import { DS } from "../../lib/design.js";
import { useState } from "react";
import { useTheme } from "../../lib/theme.jsx";
import { Sidebar } from "./Sidebar.jsx";

export function TeamLayout({ member, members, currentView, onNavigate, spaces, currentSpaceId, onSelectSpace, onSignOut, onCreateSpace, onEditSpace, onArchiveSpace, onDeleteSpace, children }) {
  const { isDark } = useTheme();
  const [libraryNav, setLibraryNav] = useState(false);

  return (
    <div
      className={currentView === "adlibrary" ? `team-layout-adlibrary${libraryNav ? " nav-open" : ""}` : undefined}
      style={{
        background: DS.bg,
        minHeight: "100vh",
        color: DS.textPrimary,
        fontFamily: DS.font,
        display: "flex",
        alignItems: "flex-start",
      }}
    >
      {currentView === "adlibrary" && <button className="adlib-mobile-navigation" aria-expanded={libraryNav} onClick={() => setLibraryNav(value => !value)} style={{ color: DS.textPrimary, background: DS.bgSide, border: DS.border }}>
        {libraryNav ? "Cerrar menú de Inforce" : "Menú de Inforce"}
      </button>}
      <Sidebar
        member={member}
        members={members}
        currentView={currentView}
        onNavigate={(...args) => { setLibraryNav(false); onNavigate(...args); }}
        spaces={spaces}
        currentSpaceId={currentSpaceId}
        onSelectSpace={(...args) => { setLibraryNav(false); onSelectSpace(...args); }}
        onSignOut={onSignOut}
        onCreateSpace={onCreateSpace}
        onEditSpace={onEditSpace}
        onArchiveSpace={onArchiveSpace}
        onDeleteSpace={onDeleteSpace}
      />
      <main
        style={{
          flex: 1,
          padding: "28px 32px 60px",
          minWidth: 0,
          maxWidth: "100%",
          position: "relative",
          backgroundColor: DS.bg,
          backgroundImage: "var(--ambient)",
          backgroundAttachment: "local",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Set color-scheme for native inputs (date, select, etc) */}
        <style>{`
          main input, main select { color-scheme: ${isDark ? "dark" : "light"}; }
          main input[type="date"] { color: ${DS.textPrimary} !important; }
          main input[type="date"]::-webkit-datetime-edit { color: ${DS.textPrimary}; }
          main input[type="date"]::-webkit-datetime-edit-fields-wrapper { color: ${DS.textPrimary}; }
          main input[type="date"]::-webkit-calendar-picker-indicator { filter: ${isDark ? "invert(1)" : "none"}; }
        `}</style>
        {/* Subtle paper/noise texture — light mode only */}
        {!isDark && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              pointerEvents: "none",
              zIndex: 0,
              backgroundImage: "url(/noise.svg)",
              backgroundRepeat: "repeat",
              backgroundSize: "300px 300px",
            }}
          />
        )}
        <div style={{ position: "relative", zIndex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  );
}

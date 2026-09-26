import { createContext, useContext, useMemo, useState } from "react";
import { useCompanyTasks } from "./hooks/useCompanyTasks.js";
import { useCompanyTaskSpaces } from "./hooks/useCompanyTaskSpaces.js";

// Context compartido entre el sidebar (en CompanyWorkspace) y el board (en
// CompanyTareas). Centraliza tasks, spaces y el filtro activo para que
// ambos consuman el mismo state — sin doble subscripción a realtime.

const TareasDataContext = createContext(null);

export function TareasDataProvider({ companyId, children }) {
  const { tasks, loading, reload } = useCompanyTasks(companyId);
  const { spaces, reload: reloadSpaces } = useCompanyTaskSpaces(companyId);
  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [showSpaceMgr, setShowSpaceMgr] = useState(false);
  const [mgrInitialEditId, setMgrInitialEditId] = useState(null);
  const [mgrInitialNewParentId, setMgrInitialNewParentId] = useState(null);

  const openManager = (opts = {}) => {
    setMgrInitialEditId(opts.editId || null);
    setMgrInitialNewParentId(opts.newParentId || null);
    setShowSpaceMgr(true);
  };
  const closeManager = () => {
    setShowSpaceMgr(false);
    setMgrInitialEditId(null);
    setMgrInitialNewParentId(null);
  };

  const value = useMemo(() => ({
    companyId,
    tasks, loading, reload, spaces, reloadSpaces,
    activeSpaceId, setActiveSpaceId,
    showSpaceMgr, mgrInitialEditId, mgrInitialNewParentId,
    openManager, closeManager,
  }), [
    companyId, tasks, loading, reload, spaces, reloadSpaces,
    activeSpaceId, showSpaceMgr, mgrInitialEditId, mgrInitialNewParentId,
  ]);

  return <TareasDataContext.Provider value={value}>{children}</TareasDataContext.Provider>;
}

export function useTareasData() {
  return useContext(TareasDataContext);
}

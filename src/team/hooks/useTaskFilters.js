import { useCallback, useEffect, useMemo, useState } from "react";
import { emptyFilterState } from "../tasks/taskFilters.js";

const SAVED_KEY = "inforce_task_saved_filters_v1";
// v2: bump para invalidar filtros de sesión viejos. Antes el default de la
// agenda ("Hoy/Ayer") ocultaba las tareas sin fecha — el bump asegura que el
// default corregido (que incluye "sin fecha") tome efecto en todos.
const STATE_PREFIX = "inforce_task_filter_state_v2_";

function readSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {}
}

// Estado de filtros persistido en sessionStorage (no localStorage) para que
// cada login/refresh arranque con los filtros default del rol. Saved filters
// nombrados siguen en localStorage (son explícitos del usuario).
function readState(key, fallback) {
  try {
    const raw = sessionStorage.getItem(STATE_PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.rules) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeState(key, state) {
  try {
    sessionStorage.setItem(STATE_PREFIX + key, JSON.stringify(state));
  } catch {}
}

export function useTaskFilters({ storageKey, defaultState }) {
  const [state, setState] = useState(() => readState(storageKey, defaultState || emptyFilterState()));
  const [saved, setSaved] = useState(() => readSaved());

  // Persiste el estado en cada cambio.
  useEffect(() => {
    if (!storageKey) return;
    writeState(storageKey, state);
  }, [storageKey, state]);

  // Escucha cambios entre pestañas
  useEffect(() => {
    const handler = (e) => {
      if (e.key === SAVED_KEY) setSaved(readSaved());
      if (e.key === STATE_PREFIX + storageKey) setState(readState(storageKey, defaultState || emptyFilterState()));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey, defaultState]);

  const reset = useCallback(() => {
    setState(defaultState || emptyFilterState());
  }, [defaultState]);

  const clearAll = useCallback(() => {
    setState(emptyFilterState());
  }, []);

  const addRule = useCallback((rule) => {
    setState((prev) => ({ ...prev, rules: [...prev.rules, rule] }));
  }, []);

  const updateRule = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      rules: prev.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const removeRule = useCallback((id) => {
    setState((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== id) }));
  }, []);

  // --- Saved filters ---
  const saveAs = useCallback((name, personal = true) => {
    const id = `sf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id, name, personal,
      state: state,
      created_at: new Date().toISOString(),
    };
    const next = [...saved, entry];
    setSaved(next);
    writeSaved(next);
    return entry;
  }, [state, saved]);

  const deleteSaved = useCallback((id) => {
    const next = saved.filter((s) => s.id !== id);
    setSaved(next);
    writeSaved(next);
  }, [saved]);

  const applySaved = useCallback((id) => {
    const entry = saved.find((s) => s.id === id);
    if (entry) setState(entry.state);
  }, [saved]);

  return useMemo(
    () => ({
      state, setState,
      reset, clearAll,
      addRule, updateRule, removeRule,
      saved, saveAs, deleteSaved, applySaved,
    }),
    [state, saved, reset, clearAll, addRule, updateRule, removeRule, saveAs, deleteSaved, applySaved]
  );
}

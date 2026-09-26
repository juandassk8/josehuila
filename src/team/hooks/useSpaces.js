import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listSpaces } from "../data/db.js";
import { logger } from "../../lib/logger.js";

export function useSpaces(currentMemberId) {
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await listSpaces();
    // Anti-wipe: si la carga falla, conservamos los espacios ya mostrados en
    // vez de vaciar el sidebar (mismo blindaje que useTasks).
    if (error) {
      logger.error("[useSpaces] carga falló, se conserva la lista actual:", error.message);
      setLoading(false);
      return;
    }
    setSpaces(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("spaces_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "spaces" },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(channel);
  }, [load]);

  // Only show private spaces owned by current user
  const visibleSpaces = spaces.filter(
    (s) => s.visibility === "shared" || s.owner_id === currentMemberId
  );

  return { spaces: visibleSpaces, allSpaces: spaces, loading, reload: load };
}

import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listScripts } from "../data/guionesDb.js";

export function useScripts() {
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await listScripts();
    setScripts(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("scripts_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scripts" },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [load]);

  return { scripts, loading, reload: load };
}

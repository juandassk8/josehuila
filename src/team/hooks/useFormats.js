import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listFormats } from "../data/guionesDb.js";

export function useFormats() {
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await listFormats();
    setFormats(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("script_formats_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "script_formats" },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [load]);

  return { formats, loading, reload: load };
}

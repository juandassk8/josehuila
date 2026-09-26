import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listContentItems } from "../data/contentDb.js";

export function useContent() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await listContentItems();
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("content_items_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "content_items" },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(channel);
  }, [load]);

  return { items, loading, reload: load };
}

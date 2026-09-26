import { useEffect, useState, useCallback, useRef } from "react";
import { database } from "../../lib/backend.js";

let channelCounter = 0;

export function useTagOptions(fieldGroup) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await database
      .from("tag_options")
      .select("*")
      .eq("field_group", fieldGroup)
      .order("sort_order", { ascending: true });
    setOptions(data || []);
    setLoading(false);
  }, [fieldGroup]);

  useEffect(() => {
    load();
    // Unique channel name per hook instance to avoid collision
    const channelName = `tag_opts_${fieldGroup}_${++channelCounter}`;
    const channel = database
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tag_options", filter: `field_group=eq.${fieldGroup}` },
        () => load()
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) database.removeChannel(channelRef.current);
    };
  }, [load, fieldGroup]);

  const createOption = useCallback(async (label, color = "default") => {
    const maxSort = options.length ? Math.max(...options.map((o) => o.sort_order)) + 1 : 0;
    const { data, error } = await database
      .from("tag_options")
      .insert({ field_group: fieldGroup, label, color, sort_order: maxSort })
      .select()
      .single();
    if (!error && data) setOptions((prev) => [...prev, data]);
    return { data, error };
  }, [fieldGroup, options]);

  const updateOption = useCallback(async (id, patch) => {
    const { error } = await database.from("tag_options").update(patch).eq("id", id);
    if (!error) setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    return { error };
  }, []);

  const deleteOption = useCallback(async (id) => {
    const { error } = await database.from("tag_options").delete().eq("id", id);
    if (!error) setOptions((prev) => prev.filter((o) => o.id !== id));
    return { error };
  }, []);

  return { options, loading, createOption, updateOption, deleteOption, reload: load };
}

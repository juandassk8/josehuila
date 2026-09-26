import { useEffect, useState, useCallback } from "react";
import { database } from "../../../lib/backend.js";

// Lee la lista de productos de una empresa desde company_voice_profile.products.
// Cada producto tiene { id, name, ...campos del cuestionario }.
// Realtime para que el dropdown se actualice si admin agrega/edita un producto
// en otro tab mientras el usuario tiene Guionista o SlotModal abiertos.

export function useCompanyProducts(companyId) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) { setProducts([]); setLoading(false); return; }
    const { data } = await database
      .from("company_voice_profile")
      .select("products")
      .eq("company_id", companyId)
      .maybeSingle();
    setProducts(Array.isArray(data?.products) ? data.products : []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    load();
    const ch = database
      .channel(`voice_profile_${companyId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "company_voice_profile", filter: `company_id=eq.${companyId}` },
        () => load()
      )
      .subscribe();
    return () => database.removeChannel(ch);
  }, [companyId, load]);

  return { products, loading, reload: load };
}

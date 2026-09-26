import { useEffect, useRef, useState } from "react";
import { database } from "../../lib/backend.js";
import BrandLoader from "../../lib/BrandLoader.jsx";
import { PlanView } from "../../workspace/PlanView.jsx";
import { PLAN_ORIGIN } from "../../lib/urls.js";

// El plan de Jose YA existe en planes-accionables.json con el slug "jose-huila"
// (marca "José Huila"). El contenido + el progreso se resuelven por ESE slug.
const PLAN_SLUG = "jose-huila";
const PLAN_URL = `${PLAN_ORIGIN}/jose-huila/`;
// La empresa contenedora (para companyId → objetivos + tareas) es una fila
// dedicada, oculta del roster. Su slug NO importa para el contenido del plan.
const CONTAINER_SLUG = "inforce";

const lastSeg = (url) => {
  try { const p = new URL(url).pathname.split("/").filter(Boolean); return p[p.length - 1] || ""; }
  catch { return ""; }
};

// Plan de implementación del PROPIO Inforce, dentro del portal admin (/equipo).
// Reusa el PlanView de los clientes TAL CUAL. Modela a "Inforce" como empresa
// dedicada (archived → oculta) para darle a PlanView el companyId que necesita,
// y apunta el contenido/progreso al plan "jose-huila" del JSON.
export function AdminPlanPage() {
  const [company, setCompany] = useState(null);
  const [error, setError] = useState(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await database
          .from("companies")
          .select("id, name, slug, objectives")
          .eq("slug", CONTAINER_SLUG)
          .limit(1);
        if (cancelled) return;
        let row = data && data[0];

        if (!row) {
          // Crear una sola vez, con el plan_url canónico ya seteado → carga solo.
          if (creatingRef.current) return;
          creatingRef.current = true;
          const newRow = { id: String(Date.now()), name: "Inforce", slug: CONTAINER_SLUG, objectives: { plan_url: PLAN_URL }, archived: true };
          const { data: created, error: insErr } = await database
            .from("companies").insert(newRow).select("id, name, slug, objectives").single();
          if (cancelled) return;
          if (insErr) { setError(insErr.message || "No se pudo preparar tu plan."); return; }
          row = created;
        } else if (lastSeg(row.objectives?.plan_url) !== PLAN_SLUG) {
          // Empresa existente con plan_url vacío o apuntando mal → corregirlo al
          // plan "jose-huila" para que cargue (fix del slug mal seteado antes).
          const objectives = { ...(row.objectives || {}), plan_url: PLAN_URL };
          await database.from("companies").update({ objectives }).eq("id", row.id);
          if (cancelled) return;
          row = { ...row, objectives };
        }

        setCompany(row);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, color: "var(--ink-2)", fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontSize: 14 }}>
        No se pudo cargar tu Plan de implementación: {error}
      </div>
    );
  }
  if (!company) return <BrandLoader label="Preparando tu plan…" />;

  return (
    <PlanView companyId={company.id} companyName="José Huila" slug={PLAN_SLUG} isAdmin={true} />
  );
}

export default AdminPlanPage;

import { useCallback, useEffect, useState } from "react";
import { database } from "../../lib/backend.js";
import { listImportJobs, esActivo } from "../inbox/importJobsDb.js";

/**
 * La cola de importación, en vivo.
 *
 * RLS es team-only, así que a un cliente esto le devuelve [] y el widget no
 * pinta nada. No hace falta chequear el rol en el front.
 *
 * El sondeo de respaldo existe porque realtime sobre una tabla con RLS depende
 * de que Realtime evalúe `is_team_admin()` con el JWT del suscriptor, y eso no
 * tiene precedente en este repo (`notifications` tiene RLS `using(true)`). Si
 * falla, falla en silencio: el widget se quedaría congelado. Con el sondeo cada
 * 10s mientras haya trabajo activo, el peor caso es ver el progreso 10 segundos
 * tarde en vez de no verlo nunca.
 */
export function useImportJobs() {
  const [jobs, setJobs] = useState([]);

  const load = useCallback(async () => {
    try { setJobs(await listImportJobs()); }
    catch { /* sin sesión de equipo → sin cola que mostrar */ }
  }, []);

  useEffect(() => {
    load();
    const channel = database
      .channel("import_jobs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "import_jobs" }, () => load())
      .subscribe();
    return () => database.removeChannel(channel);
  }, [load]);

  const hayActivos = jobs.some(esActivo);

  // El sondeo NO puede depender de que ya haya trabajos cargados: si entrás sin
  // cola, encolás, y el aviso en vivo no llega, nada dispararía una segunda
  // consulta y el widget no aparecería hasta recargar. Pasó exactamente eso.
  // Con trabajo en curso mira seguido; en reposo, de vez en cuando.
  useEffect(() => {
    const cada = hayActivos ? 8000 : 20000;
    const t = setInterval(load, cada);
    return () => clearInterval(t);
  }, [hayActivos, load]);

  return { jobs, reload: load };
}

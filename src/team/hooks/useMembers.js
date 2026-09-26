import { useEffect, useState, useCallback } from "react";
import { database } from "../../lib/backend.js";
import { listMembers } from "../data/db.js";

export function useMembers() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Los dados de baja no van en `members`.
  //
  // `listMembers()` trae la tabla entera y nadie la filtraba, así que Johan
  // —marcado `active: false` cuando dejó el equipo— seguía en la tira del War
  // Room y en el selector de responsables de un brief. Se lo podía elegir para
  // trabajo nuevo.
  //
  // `activos` es lo que se ofrece; `todos` queda disponible para lo que necesite
  // mostrar el pasado, porque una tarea vieja asignada a alguien que ya no está
  // tiene que seguir diciendo su nombre y no quedar en blanco.
  const load = useCallback(async () => {
    const { data } = await listMembers();
    setMembers(data || []);
    setLoading(false);
  }, []);

  const activos = (members || []).filter((m) => m.active !== false);

  useEffect(() => {
    load();
    const channel = database
      .channel("team_members_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members" },
        () => load()
      )
      .subscribe();
    return () => {
      database.removeChannel(channel);
    };
  }, [load]);

  // `members` sigue siendo el de siempre para quien ya lo usa; `activos` es el
  // que hay que ofrecer donde se elige a alguien para trabajo nuevo.
  return { members: activos, todos: members, loading, reload: load };
}

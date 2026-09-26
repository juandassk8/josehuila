import { useEffect, useState } from "react";
import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// Resuelve quién está reportando feedback consultando todas las posibles
// fuentes de auth en orden:
//   1. Supabase session (team Inforce — Jose, Nat) → team_members
//   2. localStorage.inforce_auth = "admin" → Admin global Jose
//   3. localStorage.inforce_auth = "client:slug" + member_id → cliente colaborador
//   4. localStorage.inforce_auth = "client:slug" sin member_id → cliente owner
//
// Devuelve null si no hay sesión (no monta el widget).

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function findCompanyBySlug(slug) {
  if (!slug) return null;
  // Intento 1: columna `slug` directa
  try {
    const { data } = await database
      .from("companies").select("id, name, slug")
      .eq("slug", slug).maybeSingle();
    if (data) return data;
  } catch { /* slug column might not exist */ }
  // Intento 2: matchear por nombre slugificado
  const { data: all } = await database.from("companies").select("id, name, slug");
  return (all || []).find((c) => (c.slug || slugify(c.name)) === slug) || null;
}

export function useFeedbackReporter() {
  const [reporter, setReporter] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      try {
        // 1. Supabase session — team Inforce
        const { data: sess } = await database.auth.getSession();
        if (sess?.session?.user) {
          const userId = sess.session.user.id;
          const email = sess.session.user.email || null;
          // team_members.id ES el id de auth.users (no hay columna auth_id).
          // Antes .eq("auth_id", ...) daba 400 (columna inexistente). Por id.
          let tm = null;
          try {
            const r = await database.from("team_members")
              .select("id, name, email, role")
              .eq("id", userId).maybeSingle();
            tm = r.data;
          } catch { /* noop */ }
          if (!tm && email) {
            const r = await database.from("team_members")
              .select("id, name, email, role")
              .eq("email", email).maybeSingle();
            tm = r.data;
          }
          if (!cancelled && tm) {
            setReporter({
              teamMemberId: tm.id,
              reporterName: tm.name || email,
              reporterEmail: tm.email || email,
              reporterRole: tm.role || "team",
            });
            return;
          }
          // Auth database pero sin team_member match — reporter mínimo
          if (!cancelled && email) {
            setReporter({
              reporterName: email,
              reporterEmail: email,
              reporterRole: "team",
            });
            return;
          }
        }

        // 2-4. localStorage based auth
        const auth = typeof localStorage !== "undefined" ? localStorage.getItem("inforce_auth") : null;
        if (!auth) return;

        if (auth === "admin") {
          if (!cancelled) setReporter({
            reporterName: "Jose (admin)",
            reporterRole: "admin",
          });
          return;
        }

        if (auth.startsWith("client:")) {
          const slug = auth.slice("client:".length);
          const company = await findCompanyBySlug(slug);
          if (!company) return;

          const memberId = localStorage.getItem("inforce_member_id");
          if (memberId) {
            const { data: m } = await database
              .from("company_team_members")
              .select("id, name, email, roles, is_owner")
              .eq("id", memberId).maybeSingle();
            if (m && !cancelled) {
              setReporter({
                companyId: company.id,
                companyName: company.name,
                memberId: m.id,
                reporterName: m.name,
                reporterEmail: m.email,
                reporterRole: m.is_owner
                  ? "owner"
                  : ((m.roles || [])[0] || "member"),
              });
              return;
            }
          }
          // Sin member_id → owner directo (PIN client)
          if (!cancelled) setReporter({
            companyId: company.id,
            companyName: company.name,
            reporterName: `${company.name} (owner)`,
            reporterRole: "owner",
          });
          return;
        }
      } catch (e) {
        logger.error("[useFeedbackReporter] failed:", e);
      }
    }

    resolve();

    // Re-resolver si cambia localStorage (login/logout)
    const onStorage = (e) => {
      if (e.key === "inforce_auth" || e.key === "inforce_member_id") {
        setReporter(null);
        resolve();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return reporter;
}

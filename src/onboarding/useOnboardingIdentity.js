import { useEffect, useState } from "react";
import { database } from "../lib/backend.js";
import { logger } from "../lib/logger.js";

// Resuelve la identity_key polimórfica del usuario actual:
//   - "admin"               → Jose con PIN admin global (sin onboarding necesario)
//   - "team:<uuid>"         → team Inforce (Nat etc) — database auth
//   - "member:<uuid>"       → workspace cliente colaborador
//   - "owner:<companyslug>" → workspace cliente owner sin member record
//
// Devuelve { identityKey, displayName, displayEmail, isOnboardingTarget }.
// `isOnboardingTarget` filtra al admin global (no le mostramos onboarding —
// él hizo la plataforma). Tampoco mostramos onboarding al team Inforce (Nat
// y Jose ya saben usar el portal).

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function findCompanyBySlug(slug) {
  if (!slug) return null;
  try {
    const { data } = await database
      .from("companies").select("id, name, slug")
      .eq("slug", slug).maybeSingle();
    if (data) return data;
  } catch { /* slug column might not exist */ }
  const { data: all } = await database.from("companies").select("id, name, slug");
  return (all || []).find((c) => (c.slug || slugify(c.name)) === slug) || null;
}

export function useOnboardingIdentity() {
  const [identity, setIdentity] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      try {
        // 1. Supabase session — team Inforce
        const { data: sess } = await database.auth.getSession();
        if (sess?.session?.user) {
          const userId = sess.session.user.id;
          const email = sess.session.user.email || null;
          let tm = null;
          try {
            // team_members.id ES el id de auth.users (no hay columna auth_id).
            // Antes consultaba .eq("auth_id", ...) → 400 Bad Request (columna
            // inexistente) y caía al fallback por email. Ahora consulta por id.
            const r = await database.from("team_members")
              .select("id, name, email").eq("id", userId).maybeSingle();
            tm = r.data;
          } catch { /* */ }
          if (!tm && email) {
            const r = await database.from("team_members")
              .select("id, name, email").eq("email", email).maybeSingle();
            tm = r.data;
          }
          if (!cancelled) {
            setIdentity({
              identityKey: tm ? `team:${tm.id}` : `team-email:${email}`,
              displayName: tm?.name || email,
              displayEmail: tm?.email || email,
              isOnboardingTarget: false, // team Inforce ya conoce el portal
            });
          }
          return;
        }

        // 2-4. localStorage based auth
        const auth = typeof localStorage !== "undefined" ? localStorage.getItem("inforce_auth") : null;
        if (!auth) return;

        if (auth === "admin") {
          if (!cancelled) setIdentity({
            identityKey: "admin",
            displayName: "Jose (admin)",
            displayEmail: null,
            isOnboardingTarget: false, // admin global no necesita onboarding
          });
          return;
        }

        if (auth.startsWith("client:")) {
          const slug = auth.slice("client:".length);
          const company = await findCompanyBySlug(slug);
          if (!company) return;

          const memberId = typeof localStorage !== "undefined"
            ? localStorage.getItem("inforce_member_id") : null;
          if (memberId) {
            const { data: m } = await database
              .from("company_team_members")
              .select("id, name, email, is_owner")
              .eq("id", memberId).maybeSingle();
            if (m && !cancelled) {
              setIdentity({
                identityKey: `member:${m.id}`,
                displayName: m.name,
                displayEmail: m.email,
                isOnboardingTarget: true,
                companyId: company.id,
                companyName: company.name,
                isOwner: !!m.is_owner,
              });
              return;
            }
          }
          // PIN client owner sin member record
          if (!cancelled) setIdentity({
            identityKey: `owner:${company.slug || slugify(company.name)}`,
            displayName: `${company.name} (owner)`,
            displayEmail: null,
            isOnboardingTarget: true,
            companyId: company.id,
            companyName: company.name,
            isOwner: true,
          });
          return;
        }
      } catch (e) {
        logger.error("[useOnboardingIdentity] failed:", e);
      }
    }
    resolve();

    const onStorage = (e) => {
      if (e.key === "inforce_auth" || e.key === "inforce_member_id") {
        setIdentity(null);
        resolve();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return identity;
}

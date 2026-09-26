import { useEffect, useState } from "react";
import { database } from "../lib/backend.js";
import { DS } from "../lib/design.js";

// Página /debug — muestra estado actual de auth/cache y permite limpiar todo
// para destrabar redirect loops o estados rotos.
export function DebugPage() {
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await database.auth.getSession().catch(() => ({ data: null }));
      if (cancelled) return;
      const ls = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          ls[k] = localStorage.getItem(k);
        }
      } catch { /* */ }
      const ss = {};
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          ss[k] = sessionStorage.getItem(k);
        }
      } catch { /* */ }
      const swReg = ("serviceWorker" in navigator)
        ? await navigator.serviceWorker.getRegistrations().catch(() => [])
        : [];
      setInfo({
        url: window.location.href,
        path: window.location.pathname,
        userAgent: navigator.userAgent,
        session: session?.data?.session ? {
          email: session.data.session.user?.email,
          id: session.data.session.user?.id,
          expires_at: session.data.session.expires_at,
        } : null,
        localStorage: ls,
        sessionStorage: ss,
        cookies: document.cookie || "(empty)",
        serviceWorkers: swReg.map((r) => r.scope),
        buildTimestamp: typeof BUILD_TIME !== "undefined" ? BUILD_TIME : "unknown",
      });
    })();
    return () => { cancelled = true; };
  }, []);

  const clearAll = async () => {
    if (!confirm("Esto va a cerrar tu sesión, limpiar localStorage, sessionStorage, cookies, service workers y caches del browser. ¿Continuar?")) return;
    setBusy(true);
    try {
      try { await database.auth.signOut(); } catch { /* */ }
      try { localStorage.clear(); } catch { /* */ }
      try { sessionStorage.clear(); } catch { /* */ }
      try {
        document.cookie.split(";").forEach((c) => {
          const eq = c.indexOf("=");
          const name = (eq > -1 ? c.substring(0, eq) : c).trim();
          document.cookie = `${name}=;expires=Thu,01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu,01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        });
      } catch { /* */ }
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch { /* */ }
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* */ }
      // Force hard reload bypassing cache.
      window.location.replace("/?_t=" + Date.now());
    } catch {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#06060A", color: "#fff",
      fontFamily: DS.font, padding: 24,
    }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
          🛠 Debug
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 22px" }}>
          Información de la sesión actual y caches del browser. Usá el botón rojo si te quedaste pegado en algún loop.
        </p>

        <button
          onClick={clearAll}
          disabled={busy}
          style={{
            padding: "12px 22px", borderRadius: 10, border: "none",
            background: "#E24B4A", color: "#fff",
            fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer",
            fontFamily: "inherit", marginBottom: 28,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Limpiando…" : "🧹 Limpiar todo y volver a /"}
        </button>

        <div style={{ display: "grid", gap: 14 }}>
          <Block label="URL actual" value={info.url} />
          <Block label="Path" value={info.path} />
          <Block label="Build" value={info.buildTimestamp} />
          <Block label="Session Supabase" value={info.session ? JSON.stringify(info.session, null, 2) : "(no session)"} />
          <Block label="localStorage" value={JSON.stringify(info.localStorage, null, 2)} />
          <Block label="sessionStorage" value={JSON.stringify(info.sessionStorage, null, 2)} />
          <Block label="Cookies" value={info.cookies} />
          <Block label="Service Workers" value={info.serviceWorkers?.length ? info.serviceWorkers.join("\n") : "(none)"} />
          <Block label="User Agent" value={info.userAgent} small />
        </div>

        <div style={{ marginTop: 30, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          💡 Si después de limpiar todavía hay loop, abrí Chrome DevTools (F12) → Network → marcá "Disable cache" → recargá. Y mandame screenshot del Network tab.
        </div>
      </div>
    </div>
  );
}

function Block({ label, value, small }) {
  return (
    <div style={{
      background: "#0E0E14", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "rgba(255,255,255,0.5)", marginBottom: 8, textTransform: "uppercase" }}>
        {label}
      </div>
      <pre style={{
        margin: 0, fontSize: small ? 10 : 12,
        color: "rgba(255,255,255,0.85)", fontFamily: "ui-monospace, monospace",
        whiteSpace: "pre-wrap", wordBreak: "break-all",
      }}>{value || "(empty)"}</pre>
    </div>
  );
}

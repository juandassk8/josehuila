import { useEffect, useState } from "react";
import { DS } from "../../lib/design.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";

// Migra en lote los colaboradores de empresas activas que aún no tienen login
// real. Muestra la hoja de credenciales para que el admin se las pase a su equipo.
export function CollaboratorMigrationModal({ onClose, onDone }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" && !running) onClose?.(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, running]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-create-client-user", {
        method: "POST",
        headers: await buildApiHeaders(),
        body: JSON.stringify({ action: "migrate-collaborators" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResults(data.results || []);
      onDone?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const created = (results || []).filter((r) => r.status === "created");
  const skipped = (results || []).filter((r) => r.status !== "created");

  const copyAll = () => {
    const txt = created.map((r) =>
      `${r.companies.join(", ")} · ${r.email} / ${r.password}`
    ).join("\n");
    navigator.clipboard?.writeText(txt).catch(() => {});
  };

  return (
    <div onClick={running ? undefined : onClose} style={{
      position: "fixed", inset: 0, zIndex: 10001,
      background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: DS.font,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto",
        background: DS.bgSide, border: `1px solid ${DS.textHint}`, borderRadius: 16,
        padding: "24px 26px", color: DS.textPrimary, boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
      }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6 }}>
          Migrar colaboradores
        </div>

        {!results ? (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Crear logins de tu equipo</h2>
            <p style={{ fontSize: 13, color: DS.textSecondary, lineHeight: 1.6, margin: "0 0 18px" }}>
              Esto le crea un login real (email + contraseña) a cada colaborador de tus empresas que
              todavía entra por PIN — tu equipo de producción (editores, diseñadores, copys…). Es
              necesario para poder cerrar la seguridad sin bloquearlos. Al terminar te muestro las
              credenciales para que se las pases.
            </p>
            {error && <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} disabled={running} style={ghostBtn}>Cancelar</button>
              <button onClick={run} disabled={running} style={{ ...primaryBtn, opacity: running ? 0.6 : 1 }}>
                {running ? "Migrando…" : "Migrar colaboradores"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
              ✅ {created.length} login{created.length === 1 ? "" : "s"} creado{created.length === 1 ? "" : "s"}
            </h2>
            <p style={{ fontSize: 12, color: DS.textSecondary, margin: "0 0 12px" }}>
              Pasale a cada persona su email + contraseña. <strong>Guardá esto ahora</strong> — no se vuelve a mostrar.
            </p>
            {created.length > 0 && (
              <div style={{ border: DS.border, borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
                {created.map((r) => (
                  <div key={r.email} style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
                    <div style={{ fontWeight: 700 }}>{r.email}</div>
                    <div style={{ color: DS.textSecondary, fontSize: 12 }}>
                      contraseña: <span style={{ fontFamily: "monospace", color: DS.textPrimary }}>{r.password}</span>
                      {"  ·  "}<span style={{ color: DS.textMuted }}>{r.companies.join(", ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {skipped.length > 0 && (
              <div style={{ fontSize: 11, color: DS.amber, marginBottom: 12 }}>
                ⚠ {skipped.length} omitido{skipped.length === 1 ? "" : "s"} (ya tenían cuenta): {skipped.map((r) => r.email).join(", ")}. Igual tendrán acceso por su email si esa cuenta existe.
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {created.length > 0 && <button onClick={copyAll} style={ghostBtn}>Copiar todo</button>}
              <button onClick={onClose} style={primaryBtn}>Listo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: "9px 20px", borderRadius: 50, border: "none", background: "#1D9E75",
  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font,
};
const ghostBtn = {
  padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent",
  color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font,
};

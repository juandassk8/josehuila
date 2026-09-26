// "Cambiar contraseña" dentro del perfil de un integrante. Solo para admins.
//
// Es el reemplazo de meterse al panel de Supabase. No manda correos —el proyecto no
// tiene SMTP— así que el resultado no es "le llegó un link", es una contraseña en
// pantalla lista para copiar y mandar por WhatsApp.
//
// Arranca cerrada, detrás de un botón. Está en el mismo modal donde se edita el
// nombre y el cumpleaños, y un campo de contraseña siempre visible ahí invita a
// cambiarla sin querer.

import { useState } from "react";
import { DS, darkInput, darkBtnGhost } from "../../lib/design.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { generarClave, revisarClave, textoParaMandar } from "./clave.js";

export function CambiarClave({ member }) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [lista, setLista] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const abrir = () => {
    // Se genera una al abrir. Lo normal es querer una contraseña nueva cualquiera,
    // no inventarse una; quien prefiera escribirla la sobreescribe.
    setClave(generarClave());
    setError("");
    setLista(false);
    setAbierto(true);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(
        textoParaMandar({ nombre: member.name, email: member.email, clave }),
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles la contraseña igual está en pantalla para copiarla a mano.
    }
  };

  const guardar = async () => {
    const revision = revisarClave(clave);
    if (!revision.ok) {
      setError(revision.error);
      return;
    }
    setGuardando(true);
    setError("");
    try {
      const headers = await buildApiHeaders();
      const res = await fetch("/api/admin-set-password", {
        method: "POST",
        headers,
        body: JSON.stringify({ memberId: member.id, password: clave }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLista(true);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <div style={caja(false)}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary }}>
            Cambiar contraseña
          </div>
          <div style={{ fontSize: 11, color: DS.textMuted, marginTop: 2, lineHeight: 1.5 }}>
            Le pones una nueva y se la mandas. No se envía ningún correo.
          </div>
        </div>
        <button onClick={abrir} style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 11 }}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...caja(true), display: "block" }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: DS.textPrimary, marginBottom: 10 }}>
        {lista ? `Contraseña nueva de ${member.name}` : "Cambiar contraseña"}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          value={clave}
          onChange={(e) => {
            setClave(e.target.value);
            setError("");
          }}
          readOnly={lista}
          spellCheck={false}
          autoComplete="off"
          style={{
            ...darkInput,
            flex: 1,
            marginBottom: 0,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: "0.06em",
            borderColor: error ? "rgba(226,75,74,0.5)" : undefined,
          }}
        />
        {!lista && (
          <button
            onClick={() => {
              setClave(generarClave());
              setError("");
            }}
            style={{ ...darkBtnGhost, padding: "9px 12px", fontSize: 11, whiteSpace: "nowrap" }}
          >
            Otra
          </button>
        )}
        <button
          onClick={copiar}
          style={{ ...darkBtnGhost, padding: "9px 12px", fontSize: 11, whiteSpace: "nowrap" }}
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>

      {/* Se ve en texto plano a propósito: hay que poder leerla para dictarla o
          pegarla. Ocultarla con puntitos acá no protege de nada —quien la está
          cambiando es quien la va a mandar— y obliga a un botón de "mostrar". */}

      {error && (
        <div style={{ fontSize: 11.5, color: DS.red, marginTop: 10, lineHeight: 1.5 }}>{error}</div>
      )}

      {lista ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, fontSize: 11, color: DS.green, lineHeight: 1.5 }}>
            Lista. Ya puede entrar con esta contraseña — cópiala y mándasela.
          </div>
          <button
            onClick={() => setAbierto(false)}
            style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 11 }}
          >
            Cerrar
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button
            onClick={guardar}
            disabled={guardando}
            style={{
              ...darkBtnGhost,
              padding: "8px 16px",
              fontSize: 11,
              color: DS.blue,
              borderColor: "rgba(88,166,255,0.45)",
              cursor: guardando ? "wait" : "pointer",
            }}
          >
            {guardando ? "Guardando…" : "Guardar contraseña"}
          </button>
          <button
            onClick={() => setAbierto(false)}
            style={{ ...darkBtnGhost, padding: "8px 16px", fontSize: 11 }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

function caja(activa) {
  return {
    marginTop: 8,
    marginBottom: 16,
    padding: "12px 14px",
    borderRadius: 12,
    background: activa ? "rgba(88,166,255,0.06)" : "rgba(140,160,190,0.05)",
    border: `1px solid ${activa ? "rgba(88,166,255,0.32)" : DS.textHint}`,
    display: "flex",
    alignItems: "center",
    gap: 12,
  };
}

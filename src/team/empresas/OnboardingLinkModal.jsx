import { useEffect, useRef, useState } from "react";
import { DS } from "../../lib/design.js";
import { database } from "../../lib/backend.js";
import { buildApiHeaders } from "../../lib/apiAuth.js";
import { siguientePantalla, pantalla, BLOQUES } from "../../formulario/flujo.js";
import { pesos, decimal } from "../../formulario/formato.js";
import { ETIQUETAS, mostrar } from "../../estandar/datos.js";

// Formulario de onboarding de un cliente, visto desde el equipo.
//
// Genera el link único de la empresa (uno vivo por empresa), deja copiar el link
// o el mensaje de WhatsApp completo, y muestra cómo va: en qué pregunta quedó, o
// —cuando termina— sus números, las alertas y el link de contraseña de cada
// socio para reenviárselo.

// Las tres llamadas (mismo reparto que src/estandar/estandar.js; se repite acá para no
// cargar el catálogo entero del Estándar solo por pintar tres filas).
const LLAMADAS_MODAL = [
  { id: "jose", quien: "José", titulo: "Estrategia", dims: [1, 2, 3, 6, 8, 9], color: "#5e87f5" },
  { id: "nath", quien: "Nath", titulo: "Contenido y marca", dims: [4, 7], color: "#af52de" },
  { id: "deison", quien: "Deison", titulo: "Tráfico y datos", dims: [5, 10], color: "#34c759" },
];

const MOTIVOS = {
  margen_en_rojo: "Pegado a su techo: le queda menos del 15% de aire",
  tres_o_mas_no_lo_se: "Tres o más \"no lo sé\"",
};

const linkDe = (token) => `${window.location.origin}/inicio/${token}`;

// El mismo bloque que copia el cliente al crear su acceso.
const bloqueDeAcceso = ({ usuario, clave, slug }) =>
  `Portal Inforce\n${window.location.origin}${slug ? `/cliente/${slug}` : "/login"}\nUsuario: ${usuario}\nContraseña: ${clave}`;

// El mensaje del spec, tal cual (docs/formulario-onboarding.md).
const mensajeWhatsApp = (nombre, link) => `Hola ${nombre || "[Nombre]"}, bienvenido a Inforce 🦾

Antes de tus llamadas de onboarding necesito que llenes este formulario:
es la información base de tu marca y es lo que nos permite llegar a las
llamadas ya habiendo estudiado tu caso.

Cada pregunta trae la instrucción de dónde sacar el dato, así que no te
vas a trancar en ninguna.

Ojo: sin el formulario completo nos toca reagendar las llamadas.

Al final creas tu acceso al portal, donde va a vivir todo tu proceso.

${link}`;

export function estadoDelFormulario(form) {
  if (!form) return null;
  if (form.status === "completo") return form.alerta ? "alerta" : "completo";
  if (form.status === "salida_dropshipping") return "dropshipping";
  return form.status === "en_curso" ? "en_curso" : "pendiente";
}

export function OnboardingLinkModal({ company, onClose, onDone }) {
  const [form, setForm] = useState(undefined);        // undefined = cargando · null = no hay
  const [perfil, setPerfil] = useState({});
  const [nombre, setNombre] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState(null);
  const [copiado, setCopiado] = useState("");
  // Usuarios del portal de la marca, y la contraseña recién generada de cada uno
  // (authUserId → clave). La clave vive solo acá, mientras el modal esté abierto:
  // no se guarda en ningún lado.
  const [usuarios, setUsuarios] = useState([]);
  const [slug, setSlug] = useState(company.slug || "");
  const [claves, setClaves] = useState({});
  const [puntosHechos, setPuntosHechos] = useState(null);   // Set de puntos ya calificados
  const [verRespuestas, setVerRespuestas] = useState(false);
  const [finalizadas, setFinalizadas] = useState(new Set());
  const downOnBackdrop = useRef(false);

  const cargar = async () => {
    const { data: forms, error: fErr } = await database.from("onboarding_forms").select("*")
      .eq("company_id", company.id).is("revoked_at", null).order("created_at", { ascending: false }).limit(1);
    if (fErr) { setError(fErr.message); setForm(null); return; }
    const f = forms?.[0] || null;
    setForm(f);
    if (f) {
      const { data } = await database.from("brand_profile_data").select("campo, valor, no_lo_se, origen").eq("company_id", company.id);
      const p = {};
      for (const fila of data || []) p[fila.campo] = fila;
      setPerfil(p);
      if (p.contacto_nombre?.valor) setNombre(p.contacto_nombre.valor);
    }
  };
  const cargarUsuarios = async () => {
    try {
      const res = await fetch("/api/onboarding-form", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ action: "usuarios", companyId: company.id }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { setUsuarios(json.usuarios || []); setSlug(json.slug || company.slug || ""); }
    } catch { /* la lista es un extra: si falla, el resto del modal sigue sirviendo */ }
  };
  const cargarOnboarding = async () => {
    const { data } = await database.from("standard_scores").select("punto, calificacion, descripcion").eq("company_id", company.id);
    setPuntosHechos(new Set((data || []).filter((x) => x.calificacion || (x.descripcion || "").trim()).map((x) => x.punto)));
    setFinalizadas(new Set((data || []).filter((x) => x.punto.startsWith("llamada:") && x.calificacion?.finalizada).map((x) => x.punto.slice(8))));
  };
  useEffect(() => { cargar(); cargarUsuarios(); cargarOnboarding(); }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const irAOnboarding = (llamada) => {
    window.history.pushState(null, "", `/equipo/onboarding/${encodeURIComponent(company.id)}?llamada=${llamada}`);
    window.dispatchEvent(new Event("pathchange"));
    onClose?.();
  };

  const nuevaClave = async (u) => {
    const aviso = claves[u.authUserId] ? "" : `Se le genera una contraseña nueva a ${u.nombre}. Si tenía otra, deja de servir. ¿Seguir?`;
    if (aviso && !window.confirm(aviso)) return;
    setTrabajando(true); setError(null);
    try {
      const res = await fetch("/api/onboarding-form", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify({ action: "nueva-clave", companyId: company.id, authUserId: u.authUserId }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo");
      setClaves((c) => ({ ...c, [u.authUserId]: json.clave }));
    } catch (err) { setError(err.message); } finally { setTrabajando(false); }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const accion = async (body) => {
    setTrabajando(true); setError(null);
    try {
      const res = await fetch("/api/onboarding-form", { method: "POST", headers: await buildApiHeaders(), body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "No se pudo");
      await cargar();
      onDone?.();
    } catch (err) { setError(err.message); } finally { setTrabajando(false); }
  };

  const copiar = async (clave, textoACopiar) => {
    try { await navigator.clipboard.writeText(textoACopiar); setCopiado(clave); setTimeout(() => setCopiado(""), 1800); } catch { setError("No se pudo copiar. Selecciónalo a mano."); }
  };

  const r = {}, noLoSe = {};
  for (const [campo, fila] of Object.entries(perfil)) {
    if (fila.origen !== "formulario") continue;
    if (fila.valor !== null) r[campo] = fila.valor;
    if (fila.no_lo_se) noLoSe[campo] = true;
  }
  const calc = (campo) => perfil[campo]?.valor ?? null;
  const estado = estadoDelFormulario(form);
  const donde = form && estado !== "completo" && estado !== "alerta" ? siguientePantalla(r, noLoSe) : null;
  const pDonde = donde && donde !== "cierre" ? pantalla(donde) : null;

  return (
    <div
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", background: DS.bgSide, border: DS.border, borderRadius: 16, padding: 24, color: DS.textPrimary, fontFamily: DS.font }}>
        <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: DS.textMuted, marginBottom: 6 }}>
          Formulario de onboarding · {company?.name}
        </div>

        {form === undefined ? (
          <p style={{ fontSize: 13, color: DS.textMuted }}>Cargando…</p>
        ) : !form ? (
          <>
            <h2 style={h2}>Generar el link del cliente</h2>
            <p style={parrafo}>
              Un link único para {company.name}. El cliente lo llena desde el celular en unos veinte minutos, se guarda en cada
              respuesta, y al final crea su acceso al portal.
            </p>
            {company.owner_user_id && (
              <p style={{ ...parrafo, color: DS.amber }}>Esta empresa ya tiene cuenta: al terminar no se le crea otra, solo se le dice que entre con su correo de siempre.</p>
            )}
            <UsuariosDeLaMarca usuarios={usuarios} claves={claves} slug={slug} trabajando={trabajando} copiado={copiado} onNueva={nuevaClave} onCopiar={copiar} />
            {error && <div style={errorStyle}>{error}</div>}
            <div style={pie}>
              <button onClick={onClose} style={ghostBtn}>Cancelar</button>
              <button onClick={() => accion({ action: "crear-link", companyId: company.id })} disabled={trabajando} style={{ ...primaryBtn, opacity: trabajando ? 0.6 : 1 }}>
                {trabajando ? "Generando…" : "Generar link"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 style={h2}>
              {estado === "alerta" || estado === "completo" ? "Formulario completo" : estado === "dropshipping" ? "Salió por dropshipping" : estado === "en_curso" ? "Lo está llenando" : "Link listo para mandar"}
            </h2>

            {(estado === "completo" || estado === "alerta") && (
              <>
                <p style={parrafo}>
                  {r.contacto_nombre || "El cliente"} lo terminó el {new Date(form.completed_at).toLocaleDateString("es-CO", { day: "numeric", month: "long" })}.
                </p>
                {form.alerta && (
                  <div style={{ ...caja, borderColor: "rgba(226,75,74,0.4)", background: "rgba(226,75,74,0.08)", color: DS.red, fontWeight: 700 }}>
                    {(form.alerta_motivos || []).map((m) => MOTIVOS[m] || m).join(" · ")}
                  </div>
                )}
                <div style={{ ...caja, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                  <Dato k="CPA hoy" v={pesos(r.cpa_mes)} />
                  <Dato k="CPA máximo" v={pesos(calc("cpa_maximo"))} />
                  <Dato k="CPA objetivo" v={pesos(r.cpa_objetivo)} />
                  <Dato k="ROAS de equilibrio" v={decimal(calc("roas_equilibrio"))} />
                  <Dato k="Meta a 3 meses" v={pesos(r.facturacion_objetivo_3m)} />
                  <Dato k="Nivel" v={calc("nivel")?.nivel ? `${calc("nivel").nivel}${calc("nivel").sobre_escala ? " · sobre la escala" : ""}` : "—"} />
                  <Dato k="Aire del margen" v={calc("salud_margen") ? `${decimal(calc("salud_margen").aire * 100, 0)}% · ${String(calc("salud_margen").semaforo).replace("_", " ")}` : "—"} />
                  <Dato k={"\"No lo sé\""} v={calc("conoce_numeros") ? `${calc("conoce_numeros").marcadas} de ${calc("conoce_numeros").de}` : "—"} />
                </div>

              </>
            )}

            {estado === "dropshipping" && (
              <p style={parrafo}>{r.contacto_nombre || "El cliente"} marcó dropshipping y vio la pantalla de salida. Hay que escribirle con su estándar. Si se equivocó de tarjeta, desactiva este link y genera uno nuevo.</p>
            )}

            {(estado === "pendiente" || estado === "en_curso") && (
              <>
                <p style={parrafo}>
                  {estado === "pendiente" ? "Todavía no lo ha abierto." : pDonde
                    ? <>Va en el bloque {pDonde.bloque} de {BLOQUES.length} · quedó en la <strong>{pDonde.id}</strong>{form.last_activity_at ? `, última vez el ${new Date(form.last_activity_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}.</>
                    : "Respondió todo; le falta crear su acceso."}
                  {" "}El mismo link lo devuelve a donde quedó.
                </p>
                <div style={etiqueta}>Link</div>
                <div style={{ ...caja, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: "monospace", color: DS.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{linkDe(form.token)}</div>
                  <button onClick={() => copiar("link", linkDe(form.token))} style={ghostBtn}>{copiado === "link" ? "Copiado" : "Copiar"}</button>
                </div>
                <div style={etiqueta}>Mensaje de WhatsApp</div>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del cliente" style={inputStyle} />
                <pre style={{ ...caja, fontFamily: DS.font, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", color: DS.textSecondary, margin: "8px 0 0" }}>{mensajeWhatsApp(nombre, linkDe(form.token))}</pre>
              </>
            )}

            {/* El onboarding de la marca: una fila por llamada, con su estado. */}
            <div style={etiqueta}>Onboarding</div>
            {LLAMADAS_MODAL.map((l) => {
              const hechos = puntosHechos ? l.dims.reduce((n, d) => n + [...puntosHechos].filter((x) => x.startsWith(`${d}.`)).length, 0) : 0;
              const lista = finalizadas.has(l.id);
              const estadoL = !puntosHechos ? "…" : lista ? "Finalizada" : hechos === 0 ? "Pendiente" : "En curso";
              return (
                <div key={l.id} style={{ ...caja, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{l.quien} · {l.titulo}</div>
                    <div style={{ fontSize: 11.5, color: lista ? DS.green : hechos ? DS.amber : DS.textMuted }}>{estadoL}{hechos ? ` · ${hechos} puntos calificados` : ""}</div>
                  </div>
                  <button onClick={() => irAOnboarding(l.id)} style={hechos || lista ? ghostBtn : primaryBtn}>{lista ? "Ver" : hechos ? "Continuar" : "Iniciar onboarding"}</button>
                </div>
              );
            })}

            {Object.keys(r).length > 0 && (
              <>
                <button onClick={() => setVerRespuestas((v) => !v)} style={{ ...ghostBtn, width: "100%", marginTop: 6 }}>
                  {verRespuestas ? "Ocultar" : "Ver"} todo lo que respondió el cliente ({Object.keys(r).length})
                </button>
                {verRespuestas && (
                  <div style={{ ...caja, marginTop: 8, display: "grid", gap: 10 }}>
                    {Object.entries(perfil).filter(([, f]) => f.origen === "formulario").map(([campo, f]) => (
                      <div key={campo}>
                        <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700 }}>{ETIQUETAS[campo] || campo}</div>
                        <div style={{ fontSize: 13, marginTop: 2, lineHeight: 1.45, overflowWrap: "anywhere" }}>{mostrar(campo, f.valor, f.no_lo_se)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <UsuariosDeLaMarca usuarios={usuarios} claves={claves} slug={slug} trabajando={trabajando} copiado={copiado} onNueva={nuevaClave} onCopiar={copiar} />

            {error && <div style={errorStyle}>{error}</div>}
            <div style={pie}>
              {estado !== "completo" && estado !== "alerta" && (
                <button
                  onClick={() => { if (window.confirm("El link deja de funcionar. Lo que el cliente ya respondió queda guardado. ¿Desactivarlo?")) accion({ action: "revocar", formId: form.id }); }}
                  disabled={trabajando} style={{ ...ghostBtn, marginRight: "auto" }}>Desactivar link</button>
              )}
              <button onClick={onClose} style={ghostBtn}>Cerrar</button>
              {(estado === "pendiente" || estado === "en_curso") && (
                <button onClick={() => copiar("msg", mensajeWhatsApp(nombre, linkDe(form.token)))} style={primaryBtn}>{copiado === "msg" ? "Copiado" : "Copiar mensaje"}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Los usuarios son inventados (<marca>.<nombre>@inforce.team): ningún «olvidé mi
// contraseña» por correo les va a llegar. Este botón es la ÚNICA forma de recuperar
// un acceso perdido, y también como se le entrega el suyo a cada socio: se genera,
// se copia y se manda por el grupo. La contraseña se ve una sola vez.
function UsuariosDeLaMarca({ usuarios, claves, slug, trabajando, copiado, onNueva, onCopiar }) {
  if (!usuarios.length) return null;
  return (
    <>
      <div style={etiqueta}>Usuarios del portal</div>
      {usuarios.map((u) => {
        const clave = claves[u.authUserId];
        return (
          <div key={u.authUserId} style={caja}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{u.nombre}{u.dueno ? " · dueño" : ""}</div>
                <div style={{ fontSize: 11.5, color: DS.textMuted, overflow: "hidden", textOverflow: "ellipsis" }}>{u.usuario}</div>
              </div>
              <button onClick={() => onNueva(u)} disabled={trabajando} style={ghostBtn}>Generar contraseña nueva</button>
            </div>
            {clave && (
              <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <code style={{ flex: 1, fontSize: 14, fontWeight: 700, color: DS.textPrimary }}>{clave}</code>
                <button onClick={() => onCopiar(u.authUserId, bloqueDeAcceso({ usuario: u.usuario, clave, slug }))} style={primaryBtn}>
                  {copiado === u.authUserId ? "Copiado" : "Copiar acceso"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: DS.textMuted, lineHeight: 1.5 }}>
        La contraseña se ve solo ahora. Cópiala y mándala por el grupo; si se pierde, se genera otra.
      </div>
    </>
  );
}

function Dato({ k, v }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{v || "—"}</div>
    </div>
  );
}

const h2 = { fontSize: 18, fontWeight: 700, margin: "0 0 6px" };
const parrafo = { fontSize: 13, color: DS.textSecondary, lineHeight: 1.55, margin: "0 0 14px" };
const etiqueta = { fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: DS.textMuted, fontWeight: 700, margin: "14px 0 6px" };
const caja = { padding: 12, borderRadius: 10, border: DS.border, background: DS.bgCard, fontSize: 13, marginBottom: 8 };
const pie = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, flexWrap: "wrap" };
const errorStyle = { color: "#E24B4A", fontSize: 12, marginTop: 8 };
const inputStyle = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: DS.border, background: DS.bgCard,
  color: DS.textPrimary, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const primaryBtn = { padding: "9px 20px", borderRadius: 50, border: "none", background: "#1D9E75", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: DS.font };
const ghostBtn = { padding: "9px 16px", borderRadius: 50, border: DS.border, background: "transparent", color: DS.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: DS.font, whiteSpace: "nowrap" };

// Formulario de onboarding de clientes — `/inicio/<token>`.
// Spec: docs/formulario-onboarding.md
//
//   GET  ?token=…                  → SIN auth. El estado del formulario de ese link.
//   POST { action:"guardar" }      → SIN auth. Guarda UNA respuesta y recalcula.
//   POST { action:"finalizar" }    → SIN auth. Crea la cuenta y las de los socios.
//   POST { action:"crear-link" }   → equipo. Genera (o devuelve) el link de una empresa.
//   POST { action:"nuevo-cliente" }→ equipo. Crea la empresa Y su link de una: el cliente
//                                    le pone el nombre a su marca al llenarlo.
//   POST { action:"revocar" }      → equipo.
//   POST { action:"usuarios" }     → equipo. Los usuarios del portal de una marca.
//   POST { action:"nueva-clave" }  → equipo. Le genera una contraseña nueva a uno.
//
// Los usuarios son inventados (<marca>.<nombre>@inforce.team): ningún «olvidé mi
// contraseña» por correo les va a llegar NUNCA. `nueva-clave` es la única forma de
// recuperar un acceso perdido, y por eso existe desde el día uno. Las contraseñas
// no se guardan en ningún lado: se muestran una vez, al generarlas.
//
// Por qué un endpoint y no leer desde el browser: `anon` está bloqueado en todas
// las tablas de tenant. El formulario se llena sin cuenta, así que el token es la
// única llave: acá se usa service_role y se devuelve SOLO lo de ese token.
//
// El servidor no confía en el navegador para nada que importe: revalida cada
// respuesta con las mismas reglas de la pantalla, decide él qué `campo` y qué
// puntos del Estándar lleva (salen de flujo.js, no del body), y rehace los
// cálculos en cada guardado.

import { randomBytes } from "node:crypto";
import { serviceClient, requireTeamAdmin, requireTeamManager, sendAuthError } from "./_lib/auth.js";
import { permitido } from "./_lib/throttle.js";
import { CAMPOS, pantalla as pantallaPorId, pantallasActivas, respuestasVigentes, estaCompleto } from "../src/formulario/flujo.js";
import { validar, validarCalculalo, marcoNoLoSe, validarAcceso } from "../src/formulario/validaciones.js";
import { usuarioDeAcceso, claveDeAcceso } from "../src/formulario/acceso.js";
import { calcular, senales, cpaDesdeCompras, roasDesdeIngresos, PUNTOS_DE_CALCULADOS } from "../src/formulario/calculos.js";

export const config = { api: { bodyParser: { sizeLimit: "256kb" } }, maxDuration: 30 };

// El link se manda por WhatsApp: no puede ser adivinable. Sin caracteres
// ambiguos (0/o, 1/l), igual que el de los briefs.
function nuevoToken(n = 28) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Contraseña que nadie conoce: con la que nace el usuario de un socio hasta que el
// equipo le genere la suya desde Empresas.
function genPassword() {
  return randomBytes(24).toString("base64url");
}

const azarServidor = (n) => Array.from(randomBytes(n));

const ipDe = (req) => String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "").trim();
const TOKEN_RE = /^[a-z0-9]{20,64}$/;
const NOMBRE_PROVISIONAL = "Cliente nuevo";
const slugDe = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// ── Lectura ─────────────────────────────────────────────────────────────────

async function formPorToken(sb, token) {
  if (!TOKEN_RE.test(String(token || ""))) return null;
  const { data } = await sb.from("onboarding_forms").select("*").eq("token", token).maybeSingle();
  if (!data || data.revoked_at) return null;
  return data;
}

// Las respuestas del formulario (no los calculados) como { r, noLoSe }.
async function leerRespuestas(sb, companyId) {
  const { data, error } = await sb
    .from("brand_profile_data")
    .select("campo, valor, no_lo_se")
    .eq("company_id", companyId)
    .eq("origen", "formulario");
  if (error) throw error;
  const r = {}, noLoSe = {};
  for (const fila of data || []) {
    if (fila.valor !== null) r[fila.campo] = fila.valor;
    if (fila.no_lo_se) noLoSe[fila.campo] = true;
  }
  return { r, noLoSe };
}

// Solo cuentan las casillas de pantallas que siguen en el flujo: si marcó "no lo
// sé" en la 2.5 y después pasó a la rama de categorías, esa casilla ya no existe.
function noLoSeVigente(r, noLoSe) {
  const vivos = new Set(pantallasActivas(r).map((p) => p.campo).filter(Boolean));
  return Object.fromEntries(Object.entries(noLoSe).filter(([c]) => vivos.has(c)));
}

// ── Escritura ───────────────────────────────────────────────────────────────

const filaRespuesta = (companyId, campo, valor, { noLoSe = false, paraRevisar = false } = {}) => ({
  company_id: companyId,
  campo,
  pantalla: CAMPOS[campo].pantalla,
  puntos_estandar: CAMPOS[campo].puntos,
  valor,
  no_lo_se: noLoSe,
  origen: "formulario",
  para_revisar: paraRevisar,
  updated_at: new Date().toISOString(),
});

// Rehace TODOS los calculados sobre las respuestas vigentes. Van en la misma
// tabla con `origen = 'calculado'` para que la pantalla del equipo y el
// diagnóstico los lean sin recalcular nada. Devuelve las filas SIN escribirlas:
// quien llama las manda en el mismo upsert que la respuesta, para que guardar sea
// un solo viaje a la base y no tres (en el celular se sentía lento).
function filasCalculadas(companyId, r, noLoSe) {
  const vigentes = respuestasVigentes(r);
  const nls = noLoSeVigente(r, noLoSe);
  const calculados = calcular(vigentes, nls);
  const ahora = new Date().toISOString();
  const filas = Object.entries(calculados).map(([campo, valor]) => ({
    company_id: companyId,
    campo,
    pantalla: null,
    puntos_estandar: PUNTOS_DE_CALCULADOS[campo] || [],
    valor,
    no_lo_se: false,
    origen: "calculado",
    para_revisar: false,
    updated_at: ahora,
  }));
  return { filas, calculados, senal: senales(vigentes, calculados, nls) };
}

async function recalcular(sb, companyId, r, noLoSe) {
  const out = filasCalculadas(companyId, r, noLoSe);
  const { error } = await sb.from("brand_profile_data").upsert(out.filas, { onConflict: "company_id,campo" });
  if (error) throw error;
  return out;
}

async function guardar(sb, form, body) {
  const p = pantallaPorId(String(body.pantalla || ""));
  if (!p || !p.campo) return { status: 400, error: "Pantalla desconocida." };

  const { r, noLoSe } = await leerRespuestas(sb, form.company_id);

  // Solo se guarda una pantalla que exista para ESTE cliente. Un dropshipper no
  // escribe el bloque 3 por más que arme el request a mano.
  if (!pantallasActivas(r).some((x) => x.id === p.id)) {
    return { status: 409, error: "Esa pregunta no aplica con lo que respondiste." };
  }

  const filas = [];
  let valor;

  if (body.calculalo !== undefined && body.calculalo !== null && p.calculalo) {
    // "Calcúlalo por mí": llega el dato crudo y la división la hace el servidor
    // con el gasto de pauta que YA está guardado. El crudo se guarda igual.
    const crudo = validarCalculalo(p.id, body.calculalo);
    if (!crudo.ok) return { status: 422, error: crudo.error };
    const gasto = r.gasto_pauta_mes;
    const calculado = p.campo === "cpa_mes" ? cpaDesdeCompras(gasto, crudo.valor) : roasDesdeIngresos(crudo.valor, gasto);
    const v = validar(p.id, calculado, { r });
    if (!v.ok) return { status: 422, error: v.error };
    valor = v.valor;
    filas.push(filaRespuesta(form.company_id, p.calculalo.campo, crudo.valor));
  } else {
    const v = validar(p.id, body.valor, { r, noLoSe: !!body.noLoSe });
    if (!v.ok) return { status: 422, error: v.error };
    valor = v.valor;
  }

  const casilla = marcoNoLoSe(p.id, valor, !!body.noLoSe);
  filas.push(filaRespuesta(form.company_id, p.campo, valor, { noLoSe: casilla }));

  for (const f of filas) {
    if (f.valor !== null) r[f.campo] = f.valor; else delete r[f.campo];
    if (f.no_lo_se) noLoSe[f.campo] = true; else delete noLoSe[f.campo];
  }

  // Todo en un solo viaje: la respuesta, los calculados y el estado del link.
  const calc = filasCalculadas(form.company_id, r, noLoSe);
  // Un CPA mayor que el ticket no se rechaza, pero se marca para la llamada.
  const filaCpa = filas.find((f) => f.campo === "cpa_mes");
  if (filaCpa) filaCpa.para_revisar = !!calc.senal.paraRevisar.cpa_mes;

  // La 1.2 le pone nombre a una empresa que nació del link («Cliente nuevo …»): así
  // aparece en Empresas con su marca desde el primer minuto. A una empresa que ya
  // tenía nombre no se le toca hasta que termine.
  if (p.campo === "marca_nombre") {
    const { data: emp } = await sb.from("companies").select("name").eq("id", form.company_id).maybeSingle();
    if (emp?.name?.startsWith(NOMBRE_PROVISIONAL)) {
      const base = slugDe(valor) || "marca";
      const { data: choca } = await sb.from("companies").select("id").eq("slug", base).neq("id", form.company_id).limit(1);
      await sb.from("companies").update({ name: valor, slug: choca?.length ? `${base}-${nuevoToken(4)}` : base }).eq("id", form.company_id);
    }
  }

  const esSalida = r.tipo_marca === "dropshipping";
  const ahora = new Date().toISOString();
  const [guardado] = await Promise.all([
    sb.from("brand_profile_data").upsert([...filas, ...calc.filas], { onConflict: "company_id,campo" }),
    sb.from("onboarding_forms").update({
      status: esSalida ? "salida_dropshipping" : "en_curso",
      started_at: form.started_at || ahora,
      last_activity_at: ahora,
    }).eq("id", form.id),
    // Si el CPA ya estaba y lo que cambió fue el ticket, la marca se actualiza igual.
    !filaCpa && r.cpa_mes !== undefined
      ? sb.from("brand_profile_data").update({ para_revisar: !!calc.senal.paraRevisar.cpa_mes }).eq("company_id", form.company_id).eq("campo", "cpa_mes")
      : null,
  ]);
  if (guardado.error) throw guardado.error;

  return { status: 200, body: { ok: true, campo: p.campo, valor, noLoSe: casilla, extra: p.calculalo && body.calculalo != null ? { [p.calculalo.campo]: body.calculalo } : undefined } };
}

// ── El cierre: la cuenta ────────────────────────────────────────────────────

async function upsertFicha(sb, companyId, socio, { authUserId = null } = {}) {
  const { data: existentes } = await sb
    .from("company_team_members").select("id, auth_user_id")
    .eq("company_id", companyId).ilike("email", socio.correo).limit(1);
  const payload = {
    company_id: companyId,
    name: socio.nombre,
    email: socio.correo,
    phone: socio.telefono || null,
    is_owner: true,
    roles: ["owner"],
  };
  if (authUserId) payload.auth_user_id = authUserId;
  if (existentes?.length) {
    const { error } = await sb.from("company_team_members").update(payload).eq("id", existentes[0].id);
    if (error) throw error;
    return existentes[0].id;
  }
  const { data, error } = await sb.from("company_team_members").insert(payload).select("id").single();
  if (error) throw error;
  return data.id;
}

async function finalizar(sb, form, body) {
  const { r, noLoSe } = await leerRespuestas(sb, form.company_id);
  if (!estaCompleto(r, noLoSe)) return { status: 409, error: "Todavía te faltan preguntas por responder." };

  const { data: company, error: cErr } = await sb
    .from("companies").select("id, name, slug, email, owner_user_id").eq("id", form.company_id).maybeSingle();
  if (cErr) throw cErr;
  if (!company) return { status: 404, error: "No encontramos tu marca. Escríbenos." };

  const { senal } = await recalcular(sb, form.company_id, r, noLoSe);
  const cerrarForm = (extra = {}) => sb.from("onboarding_forms").update({
    status: "completo",
    completed_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    alerta: senal.alerta,
    alerta_motivos: senal.motivos,
    ...extra,
  }).eq("id", form.id);

  // Cliente que ya tenía cuenta: no se le toca la contraseña ni se crean
  // usuarios de nuevo. Solo se cierra el formulario.
  if (company.owner_user_id) {
    await cerrarForm();
    return { status: 200, body: { ok: true, yaTieneCuenta: true, slug: company.slug } };
  }

  // El USUARIO lo arma el servidor —<marca>.<nombre>@inforce.team— y la contraseña
  // la generó el navegador y ya se la mostró al cliente. Nadie escribe acá su
  // correo real como usuario ni una contraseña suya.
  const marca = r.marca_nombre || company.name;
  const socios = (r.socios || []).filter((s, i, todos) => todos.findIndex((x) => x.correo === s.correo) === i);
  if (socios.length === 0) socios.push({ nombre: r.contacto_nombre || company.name, correo: "", telefono: "" });

  const acceso = validarAcceso({ correo: usuarioDeAcceso(marca, socios[0].nombre), clave: body.clave });
  if (!acceso.ok) return { status: 422, error: acceso.error };
  const { clave } = acceso.valor;

  // Crea el usuario con el primer nombre de usuario libre: si `gomibox.camilo@` ya
  // existe (dos Camilos, o un reintento), sigue con `gomibox.camilo2@`. Sin correo
  // de confirmación: la cuenta nace confirmada y el navegador entra enseguida.
  const crearUsuario = async (nombre, password) => {
    let ultimo;
    for (let intento = 0; intento < 6; intento++) {
      const email = usuarioDeAcceso(marca, nombre, intento);
      const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
      if (!error) return { id: data.user.id, email };
      ultimo = error;
      if (!/already|registered|exists/i.test(error.message || "")) break;
    }
    throw ultimo || new Error("no se pudo crear el usuario");
  };

  const creados = [];
  let correo;
  try {
    const owner = await crearUsuario(socios[0].nombre, clave);
    creados.push(owner.id);
    correo = owner.email;

    const { error: updErr } = await sb.from("companies")
      .update({ owner_user_id: owner.id, email: correo, name: marca })
      .eq("id", company.id);
    if (updErr) throw updErr;

    // La ficha guarda el correo REAL del socio (contacto); el vínculo con su
    // usuario es `auth_user_id`.
    await upsertFicha(sb, company.id, { ...socios[0], correo: socios[0].correo || correo }, { authUserId: owner.id });

    // Los demás socios: usuarios de la MISMA marca. NO se le muestran al cliente que
    // llenó el formulario: el equipo le genera la contraseña a cada uno desde el
    // modal de Empresas y se la reenvía por WhatsApp.
    const accesos = [];
    for (const socio of socios.slice(1)) {
      const u = await crearUsuario(socio.nombre, genPassword());
      creados.push(u.id);
      await upsertFicha(sb, company.id, socio, { authUserId: u.id });
      accesos.push({ nombre: socio.nombre, usuario: u.email, correo_contacto: socio.correo, auth_user_id: u.id });
    }

    const { error: fErr } = await cerrarForm({ accesos_socios: accesos });
    if (fErr) throw fErr;
  } catch (err) {
    // Rollback: sin esto quedan usuarios huérfanos y el cliente no puede reintentar.
    for (const id of creados) await sb.auth.admin.deleteUser(id).catch(() => {});
    await sb.from("companies").update({ owner_user_id: null, email: company.email || null }).eq("id", company.id);
    throw err;
  }

  return { status: 200, body: { ok: true, slug: company.slug, correo } };
}

// ── Usuarios de una marca (equipo) ──────────────────────────────────────────

// Los usuarios del portal de esta marca: el dueño y las fichas con acceso. Se
// dejan por fuera las cuentas del equipo Inforce que tengan ficha en la marca
// (Nath en Peluna lleva SU cuenta): esas no se administran desde acá.
async function usuariosDeLaMarca(sb, companyId) {
  const [{ data: company }, { data: fichas }, { data: equipo }] = await Promise.all([
    sb.from("companies").select("id, name, slug, owner_user_id").eq("id", companyId).maybeSingle(),
    sb.from("company_team_members").select("name, is_owner, auth_user_id").eq("company_id", companyId).not("auth_user_id", "is", null),
    sb.from("team_members").select("id"),
  ]);
  if (!company) return null;
  const internos = new Set((equipo || []).map((t) => t.id));
  const porId = new Map();
  for (const f of fichas || []) if (!internos.has(f.auth_user_id)) porId.set(f.auth_user_id, { authUserId: f.auth_user_id, nombre: f.name, dueno: !!f.is_owner });
  if (company.owner_user_id && !internos.has(company.owner_user_id) && !porId.has(company.owner_user_id)) {
    porId.set(company.owner_user_id, { authUserId: company.owner_user_id, nombre: company.name, dueno: true });
  }
  const usuarios = [];
  for (const u of porId.values()) {
    const { data } = await sb.auth.admin.getUserById(u.authUserId);
    if (data?.user?.email) usuarios.push({ ...u, usuario: data.user.email });
  }
  return { company, usuarios };
}

// ── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const sb = serviceClient();
  const ip = ipDe(req);

  try {
    if (req.method === "GET") {
      if (!permitido(`obf-get:${ip}`, { max: 120 })) return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });

      const form = await formPorToken(sb, req.query?.token);
      if (!form) return res.status(404).json({ error: "Este link no existe o ya no está activo." });
      const { data: company } = await sb.from("companies").select("name, slug, owner_user_id").eq("id", form.company_id).maybeSingle();

      // Completo: el token deja de devolver datos. Un link viejo rodando por
      // WhatsApp no expone los números de nadie.
      // Durante siete días sí dice cuál es el USUARIO (no es secreto y es lo que más
      // se olvida). La contraseña no se guarda en ningún lado: si el cliente reabre
      // el link en el mismo celular, la tiene ese navegador; si no, se le genera
      // una nueva desde Empresas.
      if (form.status === "completo") {
        const reciente = form.completed_at && Date.now() - new Date(form.completed_at).getTime() < 7 * 24 * 3600 * 1000;
        let usuario = "";
        if (reciente && company?.owner_user_id) {
          const { data } = await sb.auth.admin.getUserById(company.owner_user_id);
          const email = data?.user?.email || "";
          if (email.endsWith("@inforce.team")) usuario = email;
        }
        return res.status(200).json({ estado: "completo", slug: company?.slug || "", usuario });
      }

      const { r, noLoSe } = await leerRespuestas(sb, form.company_id);
      if (form.status === "salida_dropshipping") {
        return res.status(200).json({ estado: "salida", respuestas: { contacto_nombre: r.contacto_nombre || "" } });
      }
      return res.status(200).json({
        estado: "abierto",
        respuestas: r,
        noLoSe,
        yaTieneCuenta: !!company?.owner_user_id,
        slug: company?.slug || "",
        // Cómo va a quedar su usuario, para mostrárselo antes de crearlo.
        usuario: r.marca_nombre && (r.socios?.[0]?.nombre || r.contacto_nombre)
          ? usuarioDeAcceso(r.marca_nombre, r.socios?.[0]?.nombre || r.contacto_nombre) : "",
      });
    }

    if (req.method !== "POST") return res.status(405).end();
    const body = req.body || {};

    // ── Equipo ──
    if (["crear-link", "nuevo-cliente", "revocar", "usuarios", "nueva-clave"].includes(body.action)) {
      let user;
      try {
        user = body.action === "nueva-clave"
          ? await requireTeamAdmin(req)
          : await requireTeamManager(req);
      } catch (err) { return sendAuthError(res, err); }

      if (body.action === "usuarios" || body.action === "nueva-clave") {
        const marca = await usuariosDeLaMarca(sb, String(body.companyId || ""));
        if (!marca) return res.status(404).json({ error: "empresa no encontrada" });
        if (body.action === "usuarios") return res.status(200).json({ ok: true, usuarios: marca.usuarios, slug: marca.company.slug });

        // Solo a un usuario que de verdad sea de ESTA marca: el id no se toma del
        // body a ciegas, o serviría para cambiarle la clave a cualquiera.
        const quien = marca.usuarios.find((u) => u.authUserId === String(body.authUserId || ""));
        if (!quien) return res.status(404).json({ error: "Ese usuario no es de esta marca." });
        const clave = claveDeAcceso(marca.company.name, azarServidor);
        const { error } = await sb.auth.admin.updateUserById(quien.authUserId, { password: clave });
        if (error) throw error;
        return res.status(200).json({ ok: true, nombre: quien.nombre, usuario: quien.usuario, clave, slug: marca.company.slug });
      }

      // Cliente nuevo: José manda el link sin crear nada antes. La empresa nace con un
      // nombre provisional y se llama como la marca apenas el cliente responde la 1.2.
      if (body.action === "nuevo-cliente") {
        const sufijo = nuevoToken(6);
        const { data: company, error: cErr } = await sb.from("companies")
          .insert({ id: String(Date.now()), name: `${NOMBRE_PROVISIONAL} ${sufijo}`, slug: `cliente-${sufijo}` }).select("id, name, slug").single();
        if (cErr) throw cErr;
        const { data: form, error: fErr } = await sb.from("onboarding_forms")
          .insert({ company_id: company.id, token: nuevoToken(), created_by: user.id }).select("*").single();
        if (fErr) throw fErr;
        return res.status(200).json({ ok: true, company, form, nuevo: true });
      }

      if (body.action === "revocar") {
        const { error } = await sb.from("onboarding_forms").update({ revoked_at: new Date().toISOString() }).eq("id", String(body.formId || ""));
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      const companyId = String(body.companyId || "");
      const { data: company } = await sb.from("companies").select("id").eq("id", companyId).maybeSingle();
      if (!company) return res.status(404).json({ error: "empresa no encontrada" });

      // Un link vivo por empresa: si ya hay uno sin revocar se devuelve ese, para
      // que dos personas del equipo no le manden dos links distintos al cliente.
      const { data: vivos } = await sb.from("onboarding_forms").select("*")
        .eq("company_id", companyId).is("revoked_at", null).order("created_at", { ascending: false }).limit(1);
      if (vivos?.length) return res.status(200).json({ ok: true, form: vivos[0], nuevo: false });

      // Link nuevo después de una salida por dropshipping (se equivocó de tarjeta,
      // o al final sí es marca): se suelta esa respuesta, o el link nuevo lo
      // devolvería derecho a la pantalla de salida.
      await sb.from("brand_profile_data").update({ valor: null })
        .eq("company_id", companyId).eq("campo", "tipo_marca").eq("valor", JSON.stringify("dropshipping"));

      const { data: form, error } = await sb.from("onboarding_forms")
        .insert({ company_id: companyId, token: nuevoToken(), created_by: user.id }).select("*").single();
      if (error) throw error;
      return res.status(200).json({ ok: true, form, nuevo: true });
    }

    // ── Cliente ──
    const limites = { guardar: 240, finalizar: 12 };
    if (!limites[body.action]) return res.status(400).json({ error: "acción desconocida" });
    if (!permitido(`obf-${body.action}:${ip}`, { max: limites[body.action] })) {
      return res.status(429).json({ error: "Demasiados intentos. Espera unos minutos." });
    }

    const form = await formPorToken(sb, body.token);
    if (!form) return res.status(404).json({ error: "Este link no existe o ya no está activo." });
    if (form.status === "completo") return res.status(409).json({ error: "Este formulario ya está completo." });
    if (form.status === "salida_dropshipping") return res.status(409).json({ error: "Este formulario ya se cerró." });

    const out = body.action === "guardar" ? await guardar(sb, form, body) : await finalizar(sb, form, body);
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[onboarding-form]", err);
    return res.status(500).json({ error: "No pudimos guardar. Intenta de nuevo." });
  }
}

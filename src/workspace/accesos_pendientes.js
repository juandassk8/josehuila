// Quién está cargado en el equipo pero no puede entrar al portal.
//
// La ficha de cada persona ya dice "Sin acceso", pero eso solo se ve si alguien
// baja hasta ella. Medido contra la base el 2026-08-18: ocho personas reales sin
// credencial, cuatro de ellas DUEÑAS de su empresa, y Bh Kids llevaba así desde
// el 19 de abril. El dato estaba; lo que faltaba era que algo lo empujara.
//
// Los pools de UGC quedan afuera SIEMPRE: no son personas, son un cajón para
// asignar grabaciones. Contarlos como "sin acceso" convertiría el aviso en ruido
// permanente que nadie puede resolver, y un aviso que no se puede apagar deja de
// leerse.

export function accesosPendientes(members = []) {
  const gente = (members || []).filter((m) => m && !m.is_ugc_pool && !m.auth_user_id);

  // Dos situaciones distintas que se arreglan distinto: a quien tiene correo se
  // le crea la credencial de una; a quien no lo tiene hay que pedírselo primero.
  const sinCorreo = gente.filter((m) => !String(m.email || "").trim());
  const conCorreo = gente.filter((m) => String(m.email || "").trim());

  return {
    total: gente.length,
    sinCorreo,
    conCorreo,
    // Que sea el dueño el que no puede entrar es lo más grave: es quien pidió el
    // portal. Va primero en el texto.
    duenos: gente.filter((m) => m.is_owner),
  };
}

// El aviso, en una frase. Devuelve "" cuando no hay nada que decir, para que
// quien lo llama no tenga que decidir si mostrarlo.
export function textoAccesosPendientes(members = []) {
  const { total, sinCorreo, duenos } = accesosPendientes(members);
  if (!total) return "";

  const quien = total === 1 ? "1 persona está cargada" : `${total} personas están cargadas`;
  const verbo = total === 1 ? "puede" : "pueden";
  let t = `${quien} en el equipo pero no ${verbo} entrar al portal`;

  if (duenos.length) {
    const nombres = duenos.map((m) => m.name).filter(Boolean).join(", ");
    t += duenos.length === 1
      ? ` — incluido el dueño${nombres ? ` (${nombres})` : ""}`
      : ` — incluidos los dueños${nombres ? ` (${nombres})` : ""}`;
  }
  if (sinCorreo.length) {
    t += sinCorreo.length === total
      ? ". Ninguna tiene correo cargado, así que primero hay que pedírselo."
      : `. ${sinCorreo.length} ${sinCorreo.length === 1 ? "no tiene" : "no tienen"} correo cargado.`;
  } else {
    t += ". Tienen correo: se les puede crear la credencial desde su ficha.";
  }
  return t;
}

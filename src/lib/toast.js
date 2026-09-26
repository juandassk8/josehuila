// Toast mínimo e imperativo (sin estado React) para avisar fallos que antes se
// tragaban con `.catch(() => {})` — sobre todo guardados/borrados que fallan y
// dejaban al usuario creyendo que se guardó (data-loss silencioso). Se inyecta
// en document.body y se auto-remueve. Theme-agnóstico (colores propios).

// `accion` = { label, onClick }: un botón adentro del toast, para deshacer.
//
// El lugar donde uno se da cuenta de que borró lo que no era es el segundo
// después de apretar, mirando el aviso. Que la vuelta atrás esté ahí mismo vale
// mucho más que estar escondida en una papelera que hay que saber que existe.
export function toast(message, type = "error", { accion } = {}) {
  if (typeof document === "undefined") return;
  let host = document.getElementById("ifc-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "ifc-toast-host";
    host.style.cssText =
      "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:99999;" +
      "display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;";
    document.body.appendChild(host);
  }
  const bg = type === "error" ? "#E24B4A" : type === "success" ? "#1DB97A" : "#2A2F38";
  const el = document.createElement("div");
  el.style.cssText =
    `pointer-events:auto;background:${bg};color:#fff;` +
    "font:600 13px 'Plus Jakarta Sans',system-ui,sans-serif;padding:11px 18px;" +
    "border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,0.34);max-width:360px;" +
    "text-align:center;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;" +
    "display:flex;align-items:center;gap:12px;justify-content:center;";
  const texto = document.createElement("span");
  texto.textContent = message;
  el.appendChild(texto);

  const cerrar = () => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 300);
  };

  if (accion && typeof accion.onClick === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = accion.label || "Deshacer";
    btn.style.cssText =
      "flex:none;font:700 12px 'Plus Jakarta Sans',system-ui,sans-serif;color:#fff;" +
      "background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.34);" +
      "border-radius:8px;padding:5px 10px;cursor:pointer;";
    // El toast se va apenas se aprieta: dejarlo puesto invita a apretar de nuevo
    // y deshacer dos veces lo que se hizo una.
    btn.onclick = () => { cerrar(); accion.onClick(); };
    el.appendChild(btn);
  }

  host.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
  });
  // Con algo para deshacer se queda más tiempo: cuatro segundos alcanzan para
  // leer un aviso, no para decidir si uno se equivocó.
  setTimeout(cerrar, accion ? 9000 : 4200);
}

export const toastError = (m) => toast(m, "error");
export const toastSuccess = (m) => toast(m, "success");

import { useEffect, useRef, useState, useMemo} from "react";
import { DS } from "../../lib/design.js";
import { toast } from "../../lib/toast.js";
import { usePipeline } from "./data/usePipeline.js";
import { isCampaignOrLater } from "./pipelineConstants.js";
import { ProgressPanel } from "./ProgressPanel.jsx";
import { ViewBar } from "./ViewBar.jsx";
import { StageBoard } from "./StageBoard.jsx";
import { BriefView } from "./BriefView.jsx";
import { CampaignView } from "./CampaignView.jsx";
import { NewBriefModal, ExportSheet, ConfigModal, PapeleraModal } from "./PipelineModals.jsx";
import { ConfirmarAccion } from "../../lib/ConfirmarAccion.jsx";
import { ReferentePickerModal } from "./ReferentePickerModal.jsx";
import { ScriptAIPanel } from "./ScriptAIPanel.jsx";
import { ScriptQueueTray } from "./ScriptQueueTray.jsx";
import { isScriptEmpty } from "./scriptHtml.js";
import { syncPipelineTasks } from "./data/pipelineTasks.js";
import { canManagePipeline, puedeEditarCampoDelPipeline } from "../../workspace/permissions/slot_permissions.js";
import { useScriptQueue } from "./data/useScriptQueue.js";
import { AdModalCliente } from "../../despliegue/DespliegueClienteView.jsx";
import { fueraDeOrden } from "./numeracion.js";

// Content Pipeline — raíz del módulo. Vive DENTRO del portal de cada empresa
// (CompanyWorkspace), scopeado a esa empresa (sin selector). Vistas: Etapas ·
// In Campaign · Brief. Datos desde el store mock; persistencia en fase posterior.
export function ContentPipelinePage({ companyId, companyName, currentMember = null, puedeGestionar = false, puedeGenerarGuiones: puedeIA = false, focus = null, onFocusUsado }) {
  // Quién conduce la producción: crear briefs, borrarlos, mover etapas.
  //
  // Esta pantalla nunca supo quién la estaba mirando —el comentario de más abajo
  // decía "el pipeline es admin-only hoy", y dejó de ser cierto cuando se le
  // abrió a los roles del equipo—. La matriz ya existía en
  // `workspace/permissions/slot_permissions.js`; solo faltaba conectarla.
  //
  // Un editor sigue marcando sus contenidos como listos, que es lo suyo. Lo que
  // no puede es vaciar una tanda que armó otro.
  const conduce = puedeGestionar || canManagePipeline(currentMember);
  // Definir el creativo —producto, ángulo, concepto, quién lo graba— es
  // estrategia. Un editor ejecuta: marca listo y sube el archivo.
  const puedeDefinir = puedeGestionar || puedeEditarCampoDelPipeline(currentMember, "angulo");
  const company = { id: companyId, name: companyName || "Empresa" };

  const pipe = usePipeline(companyId);
  const { briefs, slots, slotsByBrief, createBrief, moveBriefStage, updateSlot, addBlankSlot, deleteSlot, deleteSlots, updateSlots, setAllOpen, demo,
    references, refConcepts, refsLoading, refsError, ensureReferences, setReferenceCover, moveReference,
    usedRefIds, createdRefIds, discardedRefIds, toggleDiscardRef, attachRef, detachRef, applyGeneratedScript, setPendingScript, clearPendingScript, deleteBrief, addSlotsAlBrief,
    papelera, restoreBrief, purgeBrief } = pipe;

  // El pipeline le pasa el trabajo al Centro de Tareas: cada etapa con pendientes
  // genera UNA tarea por brief con su avance. Se sincroniza al montar y con
  // retraso tras cada cambio, para no disparar una pasada por cada tecla.
  // Lo último que se sabe de los contenidos por brief. Hace falta para mirar el
  // brief JUSTO DESPUÉS de borrarle contenidos, cuando el render con la lista
  // nueva todavía no ocurrió.
  const slotsByBriefRef = useRef(slotsByBrief);
  useEffect(() => { slotsByBriefRef.current = slotsByBrief; }, [slotsByBrief]);

  const syncTimer = useRef(null);
  const sinSincronizar = useRef(null);   // último estado que todavía no se mandó
  useEffect(() => {
    // `cargado` es la condición de fondo: mientras sea falso, `briefs` y `slots`
    // valen `[]` porque todavía no llegaron, y sincronizar con eso cierra TODAS
    // las tareas de la empresa por huérfanas. Le pasó a Peluna Pets.
    if (!companyId || pipe.demo || !pipe.cargado) return undefined;
    sinSincronizar.current = [companyId, briefs, slots];
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      sinSincronizar.current = null;
      syncPipelineTasks(companyId, briefs, slots);
    }, 1500);
    return () => clearTimeout(syncTimer.current);
  }, [companyId, briefs, slots, pipe.demo, pipe.cargado]);

  // Cambiar una fecha y salir de la pantalla antes de segundo y medio dejaba el
  // cambio guardado en el contenido pero nunca reflejado en la tarea: el
  // `clearTimeout` de arriba se lo llevaba. Al desmontar se manda lo que quedó.
  //
  // `sinSincronizar` solo se llena cuando los datos ya cargaron, así que entrar
  // y salir de una no dispara nada. Esa era la variante fea del mismo problema:
  // antes bastaba con abrir el pipeline e irse para vaciar el tablero.
  useEffect(() => () => {
    if (sinSincronizar.current) syncPipelineTasks(...sinSincronizar.current);
  }, []);

  // Borrar un brief se lleva sus contenidos por delante, así que la confirmación
  // dice exactamente cuántos. Sin contenidos no hay nada que preguntar.
  const [borrando, setBorrando] = useState(null);   // brief pendiente de confirmar

  // El toast no dice solo que se borró: dice adónde fue y ofrece la vuelta atrás
  // en el mismo momento en que uno se da cuenta del error, que es un segundo
  // después de apretar. Tener que ir a buscar la papelera ya es tarde.
  const eliminarBrief = (brief) => {
    if (briefId === brief.id) { setBriefId(null); setView("funnel"); }
    deleteBrief(brief.id);
    toast(`"${brief.n}" fue a la papelera`, "success", {
      accion: { label: "Deshacer", onClick: () => recuperarBrief(brief.id) },
    });
  };

  const recuperarBrief = async (id) => {
    const n = await restoreBrief(id);
    toast(n ? `Recuperado con sus ${n} contenidos` : "Brief recuperado", "success");
  };

  // Siempre pregunta. Antes, un brief sin contenidos se borraba de una —"no hay
  // nada que perder"—, pero perder el brief YA es perder algo: el nombre, la
  // fecha, el lugar en el embudo. Y quien lo borra no siempre sabe que está
  // vacío.
  const onDeleteBrief = (brief) => setBorrando(brief);

  /**
   * Renumerar desde un brief.
   *
   * Pide confirmación y dice el número exacto de contenidos que se van a mover, porque
   * lo que está en juego no es el board: es que las UGC ya tengan anotado un número que
   * después no va a existir. Un «¿seguro?» genérico no alcanza para una decisión así.
   */
  const onRenumerar = async (brief) => {
    const suyos = pipe.slotsByBrief[brief.id] || [];
    const cuantos = fueraDeOrden(suyos);
    const ok = window.confirm(
      `Se van a renumerar los contenidos de "${brief.n || brief.name || "este brief"}" y los de todos los briefs siguientes, ` +
      `empezando en 001.\n\n` +
      `${cuantos} ${cuantos === 1 ? "contenido queda" : "contenidos quedan"} fuera de su bloque de concepto en este brief.\n\n` +
      `Si ya repartiste estos guiones, las UGC tienen anotado el número viejo y sus archivos ` +
      `de Drive van a dejar de cruzar. ¿Seguimos?`
    );
    if (!ok) return;
    try {
      const { cambiados } = await pipe.renumerarDesde(brief.id);
      window.alert(cambiados
        ? `Listo: ${cambiados} ${cambiados === 1 ? "contenido renumerado" : "contenidos renumerados"}.`
        : "No hizo falta mover nada.");
    } catch {
      window.alert("No se pudo renumerar. Los números quedaron como estaban.");
    }
  };

  // Un brief sin contenidos no es un brief: es lo que queda después de vaciar
  // uno. No tiene etapa, no tiene avance y no hay nada que abrir adentro — y así
  // se quedó el "Brief 2" de Peluna tres semanas en Idea. Cuando se va el último
  // contenido, el brief se va con él.
  //
  // A la papelera, no a la nada: la fila queda entera y el "Deshacer" del aviso
  // la trae de vuelta con su nombre y su fecha. Borrar de más y no poder
  // arrepentirse es lo único que no se puede permitir acá.
  const irseSiQuedoVacio = (id, borrados) => {
    const b = briefs.find((x) => x.id === id);
    if (!b) return;
    // Se pregunta contra los ids que se acaban de ir, y no contra "¿cuántos
    // quedan?", porque cuando esto corre el re-render puede haber pasado o no.
    // De las dos formas la cuenta da bien: si ya pasó, la lista está vacía; si
    // no, lo que queda es exactamente lo que se borró.
    const fuera = new Set(borrados);
    if (!(slotsByBriefRef.current[id] || []).every((s) => fuera.has(s.id))) return;
    if (briefId === b.id) { setBriefId(null); setView("funnel"); }
    deleteBrief(b.id);
    toast(`"${b.n}" quedó sin contenidos y fue a la papelera`, "success", {
      accion: { label: "Deshacer", onClick: () => recuperarBrief(b.id) },
    });
  };

  // Borrar la selección. El toast confirma cuántos se fueron: cuando lo que
  // desaparece son veinte filas de golpe, ver la lista más corta no alcanza para
  // saber que salió bien.
  const borrarSlots = async (ids) => {
    const n = await deleteSlots(ids);
    if (!n) return;
    toast(`${n} ${n === 1 ? "contenido eliminado" : "contenidos eliminados"}`, "success");
    if (briefId) irseSiQuedoVacio(briefId, ids);
  };

  const borrarSlot = (id) => {
    deleteSlot(id);
    if (briefId) irseSiQuedoVacio(briefId, [id]);
  };

  const [view, setView] = useState("funnel");     // 'funnel' | 'campaign' | 'brief'
  const [briefId, setBriefId] = useState(null);
  const [tipoFilter, setTipoFilter] = useState("todo");
  const [stageFilter, setStageFilter] = useState(null);
  const [nivelFilter, setNivelFilter] = useState(null);   // tofu|mofu|bofu|"__sin"

  // ── Modo selección ──────────────────────────────────────────────────
  // Las casillas de elegir viven detrás de un botón y no pegadas a cada fila:
  // una casilla permanente en cada contenido es ruido en la pantalla donde uno
  // viene a leer. Y apagar el modo suelta lo elegido en el MISMO gesto — si la
  // selección le sobreviviera escondida, la próxima acción borraría de más.
  const [seleccionando, setSeleccionando] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [ultimo, setUltimo] = useState(null);        // ancla del Shift+clic
  const modoSeleccion = (on) => {
    setSeleccionando(on);
    setSel(new Set());
    setUltimo(null);
  };
  const [modal, setModal] = useState(null);        // 'newBrief' | 'export' | 'config'
  const [pickerSlotId, setPickerSlotId] = useState(null);   // slot que abrió "Elegir del banco"
  const [viewingRef, setViewingRef] = useState(null);       // { slotId, ref } — ver un referente pegado
  const [ai, setAi] = useState(null);                       // { slotId, refId, review } — panel de guion IA

  // Cola en segundo plano. Vive acá (no montada global) para poder escribir el
  // estado de usePipeline: cambiar de vista no desmonta esta página, así que
  // sobrevive a toda la navegación interna.
  const queue = useScriptQueue({ companyId, memberId: null, onReady: setPendingScript });

  // Encolar en vez de abrir el modal. Sin ángulo no se puede generar a ciegas
  // (sale calcado del referente), así que ahí sí abrimos el panel para elegirlo.
  const pushToQueue = (slot, refId, angulo) => {
    const ref = (slot.refs || []).find((r) => (typeof r === "string" ? r : r?.id) === refId);
    queue.enqueue([{ slot, anchorRefId: refId, angulo, label: ref?.name || ref?.brand || slot.producto || "Slot" }]);
    toast("Guion en cola — seguí trabajando, te aviso cuando esté", "success");
  };

  // Nada se genera bloqueando: o va derecho a la cola, o se abre el panel solo
  // para elegir el ángulo (sin él el guion sale calcado del referente) y de ahí
  // también va a la cola.
  const enqueueSlot = (slot, refId = null) => {
    const angulo = slot.angulo || "";
    const prod = pipe.products.find((p) => p.id === slot.product_id || p.name === slot.producto);
    const tieneAngulos = (prod?.touchpoints?.angles || []).length > 0;
    if (!angulo && tieneAngulos) { setAi({ slotId: slot.id, refId, review: false }); return; }
    pushToQueue(slot, refId, angulo);
  };

  // Slots del brief listos para encolar: video, con referente, sin guion escrito
  // y sin propuesta pendiente. Los que no tienen ángulo se cuentan aparte y NO se
  // encolan: sin ángulo el guion sale calcado del referente.
  const pendingCandidates = (list) => {
    const out = { ready: [], sinAngulo: 0 };
    for (const s of list) {
      if (s.tipo !== "video") continue;
      if (!(s.refs || []).length) continue;
      if (s.ai_meta?.pending) continue;
      if (!isScriptEmpty(s.script)) continue;
      if (!s.angulo) { out.sinAngulo++; continue; }
      out.ready.push(s);
    }
    return out;
  };

  const enqueuePending = (list) => {
    const { ready, sinAngulo } = pendingCandidates(list);
    if (!ready.length) {
      toast(sinAngulo ? `Nada para encolar — ${sinAngulo} slot${sinAngulo === 1 ? "" : "s"} sin ángulo` : "No hay slots pendientes", "error");
      return;
    }
    queue.enqueue(ready.map((s) => {
      const first = (s.refs || [])[0];
      const rid = typeof first === "string" ? first : first?.id;
      return { slot: s, anchorRefId: rid, angulo: s.angulo, label: first?.name || first?.brand || s.producto || "Slot" };
    }));
    toast(
      `${ready.length} guion${ready.length === 1 ? "" : "es"} en cola` + (sinAngulo ? ` · ${sinAngulo} sin ángulo quedaron fuera` : ""),
      "success",
    );
  };

  // Abrir el picker para un slot (dispara la carga lazy de referentes).
  const openPicker = (slot) => { setPickerSlotId(slot.id); ensureReferences(); };
  // Pegar el referente elegido (ya es un snapshot autodescriptivo).
  const pickRef = (r) => attachRef(pickerSlotId, r);
  const pickerSlot = pickerSlotId ? slots.find((s) => s.id === pickerSlotId) : null;
  const viewingSlot = viewingRef ? slots.find((s) => s.id === viewingRef.slotId) : null;
  const aiSlot = ai ? slots.find((s) => s.id === ai.slotId) : null;
  const viewingList = (viewingSlot?.refs || []).filter((r) => typeof r === "object");

  const openBank = () => window.open("/equipo/banco", "_blank", "noopener");
  const brief = briefs.find((b) => b.id === briefId) || null;
  // Cuántos contenidos del brief abierto quedaron fuera de su bloque de concepto.
  // Es lo que decide si el botón de reordenar aparece: sin desorden no hay botón.
  const desordenEnBrief = useMemo(
    () => (brief ? fueraDeOrden(pipe.slotsByBrief[brief.id] || []) : 0),
    [brief, pipe.slotsByBrief],
  );
  const briefSlots = briefId ? (slotsByBrief[briefId] || []) : [];
  const inBrief = view === "brief" && !!brief;

  const typeOk = (s) => tipoFilter === "todo" || s.tipo === tipoFilter;
  // "Sin nivel" es una respuesta útil, no un caso borde: es la lista de lo que
  // hay que ir a clasificar después de la migración.
  const nivelOk = (s) => !nivelFilter || (nivelFilter === "__sin" ? !s.nivel_conciencia : s.nivel_conciencia === nivelFilter);

  // Alcance de datos según vista (para progress + contadores).
  const baseSlots = (inBrief ? briefSlots : slots).filter((s) => typeOk(s) && nivelOk(s));
  const scopeSlots = inBrief && stageFilter ? baseSlots.filter((s) => s.stage === stageFilter) : baseSlots;

  const onOpenBrief = (id, stage) => {
    // Lo elegido era de la lista anterior. Entrar a otro brief con esa selección
    // viva significa que el siguiente "Eliminar" se lleva contenidos que ya no
    // están en pantalla.
    modoSeleccion(false);
    setBriefId(id);
    const has = (slotsByBrief[id] || []).length > 0;
    setStageFilter(has ? stage : null);
    setView("brief");
  };
  // Llegar acá desde una tarea: abre derecho en el brief y la etapa que toca,
  // en vez de dejar al editor buscando su trabajo en la vista de embudo.
  //
  // Dos puertas para lo mismo: `focus` cuando el salto es dentro de la app (sin
  // recarga, que acá cuesta volver a autenticar) y `?brief=&etapa=` cuando el
  // link llega de afuera, como los de las notificaciones. Las dos terminan en
  // `onOpenBrief`, que es la misma función del clic normal — un solo camino que
  // mantener. Espera a que carguen los briefs: sin ellos no hay a qué abrir.
  // Guarda a qué foco ya se saltó, no un simple "ya salté": así un segundo clic
  // a otra tarea sigue funcionando sin depender de que la página se desmonte.
  const focoAplicado = useRef(null);
  useEffect(() => {
    if (!briefs.length) return;

    const params = new URLSearchParams(window.location.search);
    const briefId = focus?.briefId || params.get("brief");
    const etapa = focus?.etapa || params.get("etapa");
    if (!briefId) return;

    const clave = `${briefId}|${etapa || ""}`;
    if (focoAplicado.current === clave) return;
    focoAplicado.current = clave;

    if (briefs.some((b) => String(b.id) === String(briefId))) onOpenBrief(briefId, etapa || null);
    onFocusUsado?.();

    // Los parámetros se borran de la barra para que recargar no vuelva a saltar.
    if (params.has("brief")) {
      params.delete("brief"); params.delete("etapa");
      const q = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : "") + window.location.hash);
    }
  }, [briefs, focus]);   // eslint-disable-line react-hooks/exhaustive-deps

  const changeView = (v) => {
    // Salir de la vista del brief suelta la selección por lo mismo que al
    // cambiar de brief: era de esa lista, no de la que viene.
    if (v !== "brief") modoSeleccion(false);
    if (v === "funnel") { setView("funnel"); setBriefId(null); setStageFilter(null); }
    else if (v === "brief") { if (brief) setView("brief"); }
    else setView(v);   // campaign
  };
  const backToFunnel = () => changeView("funnel");

  const nextN = briefs.length + 1;
  const onCreateBrief = ({ n, created, owner, plan, extras }) => {
    createBrief({ n, created, owner, plan, extras });
    setModal(null);
    toast("Brief creado en Idea", "success");
  };

  // Volver a la planeación de un brief que ya existe y sumarle contenidos en
  // tanda. Misma pantalla que al crearlo: elegís cuántos de cada concepto.
  const onAgregarContenidos = async ({ plan, extras }) => {
    const n = await addSlotsAlBrief(briefId, { plan, extras });
    setModal(null);
    if (n) toast(`${n} ${n === 1 ? "contenido agregado" : "contenidos agregados"} a ${brief?.n || "el brief"}`, "success");
  };
  // El botón principal crea trabajo, así que también depende de quién conduce.
  const primaryAction = !conduce ? null
    : inBrief ? () => setModal("addSlots") : () => setModal("newBrief");
  const primaryLabel = inBrief ? "+ Agregar contenidos" : "+ Nuevo brief";

  // Campaign view: slots en campaign+ del alcance (empresa o brief), filtrados por tipo.
  const campaignSlots = (inBrief ? briefSlots : slots).filter((s) => typeOk(s) && isCampaignOrLater(s.stage));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "auto" }}>
      {/* Header de página */}
      <div style={{ padding: "22px 30px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: DS.textHint }}>
          <span>{company.name}</span><span>/</span><span>Content Pipeline</span>
          {inBrief && <><span>/</span><span style={{ color: DS.textMuted }}>{brief.n}</span></>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          {inBrief && (
            <button type="button" onClick={backToFunnel} title="Volver a etapas"
              style={{ width: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 10, cursor: "pointer", color: DS.textSecondary, background: "var(--chip)", border: "1px solid var(--line)" }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          )}
          <h1 style={{ fontSize: 29, fontWeight: 700, letterSpacing: "-0.032em", color: DS.textPrimary, margin: 0 }}>{inBrief ? brief.n : "Content Pipeline"}</h1>
          <span className="mono" style={{ fontSize: 12, color: DS.textMuted, padding: "5px 10px", borderRadius: 999, background: "var(--chip)" }}>
            {inBrief ? `${company.name} · Creado ${brief.created} · ${brief.owner}` : `${company.name} · ${briefs.length} briefs activos`}
          </span>
          {demo && (
            <span title="Datos de ejemplo — corré db/content_pipeline.sql para guardar de verdad"
              style={{ fontSize: 11, fontWeight: 600, color: "var(--amber)", background: "rgba(240,169,59,.15)", border: "1px solid rgba(240,169,59,.35)", borderRadius: 999, padding: "4px 10px" }}>demo · sin guardar</span>
          )}
          <div style={{ flex: 1 }} />
          {conduce && (
            <button type="button" onClick={() => setModal("config")} className="glass" style={btnSecondary} title="Configurar productos, ángulos y creadores">⚙ Configurar</button>
          )}
          {/* Solo aparece cuando hay algo adentro: una papelera siempre vacía es
              un botón que nadie mira, y el día que hace falta tampoco se ve. */}
          {conduce && papelera.length > 0 && (
            <button type="button" onClick={() => setModal("papelera")} className="glass" style={btnSecondary}
              title="Briefs borrados — se pueden recuperar">
              Papelera · {papelera.length}
            </button>
          )}
          {/* Renumerar vive acá arriba, con las acciones del brief.
              Estaba al final de la vista, debajo de los cincuenta contenidos: para
              encontrarlo había que scrollear todo el brief, y algo que no se ve no
              existe. Solo aparece con un brief abierto y si hay algo fuera de sitio;
              cuando está todo ordenado no ocupa lugar. */}
          {conduce && brief && desordenEnBrief > 0 && (
            <button type="button" onClick={() => onRenumerar(brief)} className="glass" style={btnSecondary}
              title={`${desordenEnBrief} ${desordenEnBrief === 1 ? "contenido está" : "contenidos están"} fuera de su bloque de concepto`}>
              Reordenar · {desordenEnBrief}
            </button>
          )}
          <button type="button" onClick={() => setModal("export")} className="glass" style={btnSecondary}>Compartir guiones</button>
          <button type="button" onClick={openBank} className="glass" style={btnSecondary}>Banco ↗</button>
          {primaryAction && (
            <button type="button" onClick={primaryAction} style={btnPrimary}>{primaryLabel}</button>
          )}
        </div>
      </div>

      <ProgressPanel slots={scopeSlots} stageFilter={inBrief ? stageFilter : null} onStageFilter={inBrief ? setStageFilter : null} />

      <ViewBar
        view={view} onView={changeView} inBrief={inBrief} briefName={brief?.n}
        tipoFilter={tipoFilter} onTipo={setTipoFilter}
        stageFilter={stageFilter} onStageFilter={setStageFilter}
        nivelFilter={nivelFilter} onNivel={setNivelFilter}
        seleccionando={seleccionando} onSeleccionar={conduce && inBrief ? modoSeleccion : undefined}
        onExpandAll={(open) => setAllOpen(briefId, open)}
        scopeCount={scopeSlots.length} baseCount={baseSlots.length}
      />

      <div style={{ marginTop: 18 }}>
        {view === "funnel" && (
          <StageBoard briefs={briefs} slotsByBrief={slotsByBrief} tipoFilter={tipoFilter} nivelFilter={nivelFilter} onOpenBrief={onOpenBrief}
            onNewBrief={conduce ? () => setModal("newBrief") : undefined}
            onMoveBrief={conduce ? moveBriefStage : undefined}
            onDeleteBrief={conduce ? onDeleteBrief : undefined} />
        )}
        {view === "campaign" && <CampaignView slots={campaignSlots} onUpdate={updateSlot} />}
        {view === "brief" && brief && (
          <BriefView brief={brief} slots={briefSlots} catalogs={pipe.catalogs} bank={pipe.bank} products={pipe.products}
            tipoFilter={tipoFilter} stageFilter={stageFilter} nivelFilter={nivelFilter}
            puedeDefinir={puedeDefinir}
            seleccionando={seleccionando} sel={sel} setSel={setSel} ultimo={ultimo} setUltimo={setUltimo}
            onTerminarSeleccion={() => modoSeleccion(false)}
            onUpdateSlots={conduce ? updateSlots : undefined}
            onUpdateSlot={updateSlot} onDeleteSlot={conduce ? borrarSlot : undefined}
            /* Elegir varios y borrarlos de una es la misma facultad que borrar
               uno: si no conducís la tanda, no aparecen ni los checkboxes. */
            onDeleteSlots={conduce ? borrarSlots : undefined}
            onAddSlot={conduce ? (tipo) => addBlankSlot(briefId, tipo) : undefined}
            onPickBankRef={openPicker} onOpenRef={(slot, ref) => setViewingRef({ slotId: slot.id, ref })} onRemoveRef={detachRef}
            /* Sin guionista habilitado, los dos disparadores de IA no se
               ofrecen: `BriefView` y `SlotCard` esconden el botón cuando no les
               llega el handler. Revisar un guion que YA existe sigue disponible
               —no gasta tokens y sacarlo dejaría guiones colgados. */
            onGenerateScript={puedeIA ? enqueueSlot : undefined}
            onReviewScript={(slot) => setAi({ slotId: slot.id, refId: slot.ai_meta?.pending?.anchorRefId || null, review: true })}
            onGeneratePending={puedeIA ? enqueuePending : undefined}
            onDeleteBrief={conduce ? () => onDeleteBrief(brief) : undefined}
            onRenumerar={conduce ? () => onRenumerar(brief) : undefined} />
        )}
      </div>

      {/* Modales */}
      {modal === "addSlots" && brief && (
        <NewBriefModal
          modo="agregar"
          briefName={brief.n}
          companyName={company.name} nextN={nextN}
          owners={pipe.owners.length ? pipe.owners : pipe.catalogs.creadores.filter((c) => c !== "Sin creador")}
          bank={pipe.bank} onCreate={onAgregarContenidos} onClose={() => setModal(null)} />
      )}
      {modal === "newBrief" && (
        <NewBriefModal companyName={company.name} nextN={nextN}
          owners={pipe.owners.length ? pipe.owners : pipe.catalogs.creadores.filter((c) => c !== "Sin creador")}
          bank={pipe.bank} onCreate={onCreateBrief} onClose={() => setModal(null)} />
      )}
      {modal === "export" && (
        <ExportSheet slots={slots} catalogs={pipe.catalogs}
          companyId={companyId} brief={brief} briefs={briefs} onClose={() => setModal(null)} />
      )}
      {/* Pasa al `ConfirmarAccion` compartido para poder pedir el nombre escrito.
          Un brief se lleva decenas de guiones ajenos: apretar "sí" de apuro no
          debería alcanzar. */}
      {borrando && (
        <ConfirmarAccion
          accion={{
            titulo: `¿Eliminar "${borrando.n}"?`,
            detalle: (slotsByBrief[borrando.id] || []).length
              ? `Se van con él sus ${(slotsByBrief[borrando.id] || []).length} contenidos, con sus guiones y referentes. Queda en la papelera y se puede recuperar.`
              : "Este brief todavía no tiene contenidos. Queda en la papelera y se puede recuperar.",
            escribir: borrando.n,
            ok: "Eliminar brief",
            peligro: true,
            onOk: () => eliminarBrief(borrando),
          }}
          onCancel={() => setBorrando(null)}
        />
      )}

      {modal === "papelera" && (
        <PapeleraModal briefs={papelera}
          onRestore={(id) => { recuperarBrief(id); if (papelera.length <= 1) setModal(null); }}
          onPurge={purgeBrief}
          onClose={() => setModal(null)} />
      )}

      {modal === "config" && (
        <ConfigModal products={pipe.products} niche={pipe.niche}
          sofisticacion={pipe.sofisticacion} onSetSofisticacion={pipe.setSofisticacionEmpresa}
          onAddProduct={pipe.addProduct} onUpdateProduct={pipe.updateProduct} onRemoveProduct={pipe.removeProduct} onSetNiche={pipe.setCompanyNiche}
          onClose={() => setModal(null)} />
      )}

      {/* Picker "Elegir del banco" (referentes reales de la empresa) */}
      {pickerSlot && (
        <ReferentePickerModal slot={pickerSlot} references={references} concepts={refConcepts} prioridades={pipe.prioridades} loading={refsLoading} error={refsError}
          usedIds={usedRefIds} createdIds={createdRefIds} discardedIds={discardedRefIds} onToggleDiscard={toggleDiscardRef}
          onRetry={ensureReferences} onPick={pickRef} onSetCover={setReferenceCover} onMove={moveReference} onClose={() => setPickerSlotId(null)} />
      )}
      {/* Guion con IA — el panel propone, el slot no se toca hasta insertar.
          memberId va null: el pipeline es admin-only hoy y el admin del equipo no
          es una fila de company_team_members. El uso se cuenta igual, por empresa. */}
      {aiSlot && (
        <ScriptAIPanel slot={aiSlot} companyId={companyId} memberId={null} products={pipe.products} anchorRefId={ai.refId}
          initialResult={ai.review ? aiSlot.ai_meta?.pending || null : null}
          onEnqueue={(angulo) => { pushToQueue(aiSlot, ai.refId, angulo); setAi(null); }}
          onInsert={(html, meta) => { applyGeneratedScript(aiSlot.id, html, meta); clearPendingScript(aiSlot.id); setAi(null); toast("Guion insertado en el slot", "success"); }}
          onClose={() => setAi(null)} />
      )}

      <ScriptQueueTray
        jobs={queue.jobs} pending={queue.pending} ready={queue.ready}
        onReview={(j) => setAi({ slotId: j.slotId, refId: j.anchorRefId || null, review: true })}
        onRetry={queue.retry} onCancel={queue.cancel} onClear={queue.clearFinished} />

      {/* Ver un referente ya pegado al slot (visor real del despliegue) */}
      {viewingRef && viewingRef.ref && (
        <AdModalCliente
          canTranscribe
          concept={{ format: viewingRef.ref.format, name: viewingRef.ref.concept_name, stage: viewingRef.ref.stage }}
          list={viewingList} initialRef={viewingRef.ref} view="reference"
          onSelect={(next) => setViewingRef((v) => ({ ...v, ref: next }))}
          onClose={() => setViewingRef(null)} />
      )}
    </div>
  );
}

const btnSecondary = { fontSize: 13, fontWeight: 600, color: DS.textSecondary, padding: "10px 16px", borderRadius: 11, cursor: "pointer", fontFamily: DS.font };
const btnPrimary = { fontSize: 13, fontWeight: 600, color: "#FFFFFF", padding: "10px 16px", borderRadius: 11, cursor: "pointer", fontFamily: DS.font, background: "var(--sel)", border: "none", boxShadow: "var(--sel-rim)" };

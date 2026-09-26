export function collectionCopy(collection) {
  if (!collection) return { title: 'Comprobando importación', description: 'Consultando el estado de esta marca.' };
  const retry = collection.retryAt && Number.isFinite(Date.parse(collection.retryAt))
    ? new Date(collection.retryAt).toLocaleString('es-CO') : null;
  switch (collection.phase) {
    case 'rate_limited': return { title: 'Importación en espera', description: `Meta limitó las consultas de la fuente compartida. Esta marca está en cola${retry ? `; el próximo intento podrá comenzar a partir de ${retry}` : ''}. Esa hora no garantiza que termine la importación.` };
    case 'running': return { title: 'Consultando anuncios', description: collection.progress?.adsSeen
      ? `${collection.progress.adsSeen} anuncios recibidos. La consulta sigue en curso; los archivos se guardan en segundo plano.`
      : 'El recolector está consultando esta marca. Los anuncios aparecerán aquí conforme se guarden.' };
    case 'queued': return { title: 'Marca en cola', description: 'La marca está guardada y espera su turno de consulta. Esta pantalla se actualizará automáticamente.' };
    case 'retrying': return { title: 'Reintento pendiente', description: 'La consulta anterior no terminó. El recolector volverá a intentarlo después de la espera programada.' };
    case 'unavailable': return { title: 'Importación no disponible', description: 'La marca está guardada, pero no se pudo confirmar un recolector disponible. Los anuncios ya guardados siguen disponibles.' };
    case 'paused': return { title: 'Importación pausada', description: 'La cola de consultas está pausada. La marca sigue guardada.' };
    case 'failed': return { title: 'La consulta no se completó', description: 'No se ha podido completar la consulta de esta marca. Conservamos los anuncios recibidos y el seguimiento para próximos intentos.' };
    case 'ready': return { title: 'Consulta completada', description: 'La biblioteca refleja la última consulta completa.' };
    default: return { title: 'Pendiente de importación', description: 'La marca está guardada, pero aún no tiene una consulta completa ni un trabajo confirmado en la cola.' };
  }
}

export function collectionNotice(result, following = false) {
  const prefix = following ? 'Marca añadida. ' : '';
  if (result.cached) return prefix + 'Su biblioteca ya está disponible.';
  if (result.queued === false) return prefix + 'No se pudo poner la consulta en cola. El seguimiento quedó guardado para que el programador vuelva a intentarlo.';
  return prefix + collectionCopy(result.collection).description;
}

export function collectionRevision(collection) {
  return [collection.phase, collection.revision, collection.progress?.pagesSeen, collection.progress?.adsSeen].join('|');
}

export function collectionPollDelay(collection) {
  return collection?.phase === 'running' ? 10_000 : ['queued', 'retrying'].includes(collection?.phase) ? 15_000 : 60_000;
}

export function collectionCopy(collection) {
  if (!collection) return { title: 'Comprobando importación', description: 'Consultando el estado de esta marca.' };
  switch (collection.phase) {
    case 'rate_limited': return { title: 'Preparando biblioteca', description: 'La marca está guardada. Seguimos preparando sus anuncios en segundo plano; no necesitas agregarla otra vez.' };
    case 'running': return { title: 'Consultando anuncios', description: collection.progress?.adsSeen
      ? `${collection.progress.adsSeen} anuncios recibidos. La consulta sigue en curso; los archivos se guardan en segundo plano.`
      : 'El recolector está consultando esta marca. Los anuncios aparecerán aquí conforme se guarden.' };
    case 'queued': return { title: 'Marca en cola', description: 'La marca está guardada y espera su turno de consulta. Esta pantalla se actualizará automáticamente.' };
    case 'retrying': return { title: 'Actualización en preparación', description: 'Conservamos los anuncios disponibles y volveremos a consultar la marca automáticamente.' };
    case 'unavailable': return { title: 'Preparación pendiente', description: 'Tu marca está guardada y estamos comprobando su actualización. Puedes seguir consultando los anuncios disponibles.' };
    case 'paused': return { title: 'Importación pausada', description: 'La cola de consultas está pausada. La marca sigue guardada.' };
    case 'failed': return { title: 'Seguimos preparando la biblioteca', description: 'La marca sigue guardada. Conservamos los anuncios recibidos y el servidor volverá a consultar los que faltan.' };
    case 'ready': return { title: 'Consulta completada', description: 'La biblioteca refleja la última consulta completa.' };
    default: return { title: 'Pendiente de importación', description: 'La marca está guardada, pero aún no tiene una consulta completa ni un trabajo confirmado en la cola.' };
  }
}

export function collectionNotice(result, following = false) {
  const prefix = following ? 'Marca añadida. ' : '';
  if (result.cached) return prefix + 'Su biblioteca ya está disponible.';
  if (result.queued === false) return prefix + 'El seguimiento quedó guardado. El servidor preparará su biblioteca en segundo plano.';
  return prefix + collectionCopy(result.collection).description;
}

export function collectionRevision(collection) {
  return [collection.phase, collection.revision, collection.progress?.pagesSeen, collection.progress?.adsSeen].join('|');
}

export function collectionPollDelay(collection) {
  return collection?.phase === 'running' ? 10_000 : ['queued', 'retrying'].includes(collection?.phase) ? 15_000 : 60_000;
}

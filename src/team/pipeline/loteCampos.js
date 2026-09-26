// Los campos que se ponen en tanda desde la barra de selección.
//
// Casi todos son un patch plano —poner el mismo ángulo en diez slots es poner el
// mismo ángulo en diez slots—, pero dos no lo son, y esos dos viven acá para que
// la regla esté escrita en un solo lugar y se pueda probar.

/**
 * El patch de elegir un CONCEPTO para un slot.
 *
 * Elegir concepto arrastra el nivel de conciencia que ese concepto tiene en el banco,
 * pero SOLO si el slot no traía uno. Si alguien se lo puso a mano, el concepto no se
 * lo pisa: hay creativos que entran por otro punto del embudo a propósito.
 *
 * En la fila de a uno esto ya funcionaba así. En tanda es más importante todavía —un
 * patch plano le pisaría el nivel a los diez de una, y nadie va a revisar diez filas
 * para darse cuenta.
 */
export function patchDeConcepto(slot, concepto, nivelPorConcepto = {}) {
  const sugerido = nivelPorConcepto?.[concepto] || "";
  if (!sugerido || slot?.nivel_conciencia) return { concepto };
  return { concepto, nivel_conciencia: sugerido };
}

/**
 * El patch de elegir un PRODUCTO.
 *
 * Va con su id. El resto del sistema cruza por `product_id` —los ángulos y los
 * creadores cuelgan de ahí—, así que guardar solo el nombre deja el slot con un
 * producto que se lee bien en pantalla y no sirve para nada más.
 */
export function patchDeProducto(nombre, products = []) {
  return {
    producto: nombre,
    product_id: products.find((p) => p.name === nombre)?.id || null,
  };
}

/**
 * De "qué campo se tocó" al patch que hay que aplicar.
 *
 * Casi todos son directos. Los dos que no —producto y concepto— tienen su función
 * arriba con el porqué. Devolver una FUNCIÓN en el caso del concepto no es capricho:
 * `updateSlots` la corre por slot, que es lo único que evita pisarle el nivel de
 * conciencia a quien lo tenía puesto a mano.
 */
export function patchDeCampo(campo, valor, { products = [], nivelPorConcepto = {} } = {}) {
  if (campo === "producto") return patchDeProducto(valor, products);
  if (campo === "concepto") return (slot) => patchDeConcepto(slot, valor, nivelPorConcepto);
  return { [campo]: valor };
}

/**
 * Las opciones que dependen del producto: ángulos y creadores.
 *
 * Si todos los elegidos comparten producto se ofrecen los suyos. Mezclados, los de la
 * empresa entera: no hay una lista "correcta" para una selección que cruza productos,
 * y ofrecer la del primero sería inventarse cuál manda.
 */
export function opcionesDelLote(elegidos = [], products = [], catalogs = {}) {
  const ids = new Set(elegidos.map((s) => s.product_id || s.producto || ""));
  const comun = ids.size === 1
    ? products.find((p) => p.id === elegidos[0]?.product_id || p.name === elegidos[0]?.producto) || null
    : null;

  const delProducto = (comun?.touchpoints?.angles || []).map((a) => a.title).filter(Boolean);
  return {
    producto: comun,
    angulos: delProducto.length ? delProducto : (catalogs.angulos || []),
    creadores: comun?.creators?.length ? comun.creators : (catalogs.creadores || []),
  };
}

// Mantener el vocabulario de etiquetas chico y estable.
//
// El banco se llenó de sinónimos: siete formas de decir "pijamas" (Pijamas,
// Ropa de dormir, Lencería y pijamas, Moda mayorista, Pijamas y ropa de
// descanso…) y nueve de "salud digestiva canina". El patrón es siempre el
// mismo: el modelo COMPONE una etiqueta nueva juntando dos conceptos en vez de
// elegir la que ya existe.
//
// Acá va la parte determinista, que no depende de que el modelo obedezca: antes
// de guardar, cada valor se intenta colapsar contra el vocabulario que ya se usa.
// Lo que el prompt no logre, esto lo corrige igual.

const ACENTOS = /[̀-ͯ]/g;

// Clave de comparación: sin mayúsculas, acentos ni signos.
export function claveEtiqueta(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(ACENTOS, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Palabras que no distinguen nada: unen conceptos o los adornan.
const VACIAS = new Set(["y", "e", "o", "u", "de", "del", "la", "el", "los", "las", "para", "con", "en", "a"]);

const palabras = (s) => claveEtiqueta(s).split(" ").filter((w) => w && !VACIAS.has(w));

// Singular tosco para español: "pijamas" → "pijama", "caninas" → "canina".
// Solo para comparar, nunca para mostrar.
const raiz = (w) => w.replace(/(es|s)$/, "");

const mismoConjunto = (a, b) => a.length === b.length && a.every((w) => b.includes(w));

// ¿La etiqueta une DOS conceptos? ("Lencería y pijamas", "Moda / pijamas")
//
// Es la distinción que decide si se puede colapsar. Contra los datos reales:
// "Pijamas y ropa de dormir" une dos cosas y una ya existe → sobra. Pero "Salud
// hepática" o "Venta directa" son UNA sola cosa, más específica — colapsarlas
// contra "Salud" o "Venta" borra justo la señal que hace útil al banco. Sin este
// corte, 11 usos de "Salud hepática" se perdían dentro de "Salud".
const CONECTORES = /(\s+(y|e|o|u)\s+|[/+,;])/i;
const esCompuesta = (s) => CONECTORES.test(String(s || ""));

// Distancia de edición acotada — para erratas y acentos perdidos.
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Devuelve la etiqueta EXISTENTE que corresponde a `valor`, o null si de verdad
// es nueva. `conocidas` viene ordenada por uso: ante empate gana la más usada,
// que es la que el equipo ya reconoce.
//
// Tres formas de ser "la misma", de más a menos segura:
//   1. misma clave — solo cambia cómo está escrita ("calzado" / "Calzado")
//   2. mismas palabras significativas en cualquier orden y número
//      ("Caida Cabello" / "Caída de cabello", "Alergias caninas" / "Alergia canina")
//   3. la propuesta UNE dos conceptos y uno de ellos ya existe
//      ("Pijamas y ropa de dormir" → "Pijamas", "Lencería y pijamas" → "Pijamas")
//      Solo si hay conector: ver `esCompuesta`.
export function canonizarEtiqueta(valor, conocidas = [], { fuzzy = false } = {}) {
  const v = String(valor || "").trim();
  if (!v) return null;
  const k = claveEtiqueta(v);
  if (!k) return null;

  const pv = palabras(v).map(raiz);
  const compuesta = esCompuesta(v);
  let contiene = null;

  for (const c of (conocidas || [])) {
    const kc = claveEtiqueta(c);
    if (!kc) continue;
    if (kc === k) return c;                                     // (1)

    const pc = palabras(c).map(raiz);
    if (pc.length && mismoConjunto(pv, pc)) return c;            // (2)

    // (3) Solo para compuestas: una de las dos partes ya existe. La primera que
    // aparece gana porque `conocidas` viene ordenada por uso.
    if (compuesta && !contiene && pc.length && pc.length < pv.length && pc.every((w) => pv.includes(w))) contiene = c;

    if (fuzzy && k.length >= 4 && kc.length >= 4) {
      const d = lev(k, kc);
      if (d <= (Math.min(k.length, kc.length) >= 6 ? 2 : 1)) return c;
    }
  }
  return contiene;
}

// Ordena el vocabulario por uso y recorta: el prompt no necesita la cola larga,
// y mandarla plana hacía que el modelo eligiera cualquiera de las variantes como
// si todas valieran lo mismo.
// `conConteo: false` para las categorías donde el número haría daño. El conteo
// dice "esta es la establecida", que es lo que se quiere para una marca o un
// formato; para un NICHO empuja a meter un mercado nuevo en el más grande que ya
// existe. El orden por uso se conserva igual — eso sí ayuda.
export function vocabularioParaPrompt(conteos = {}, max = 40, { conConteo = true } = {}) {
  return Object.entries(conteos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([valor, n]) => (conConteo ? `${valor} (${n})` : valor))
    .join(", ");
}

// Con qué valor se queda un grupo de variantes.
//
// No siempre gana la más usada. En el banco real, "Pijamas y ropa de dormir" se
// usa 33 veces y "Pijamas" 13: quedarse con la más usada consagraría justo la
// etiqueta compuesta que estamos tratando de sacar. Para las categorías
// DESCRIPTIVAS gana la más simple —menos palabras significativas—, y la más
// usada solo desempata.
//
// Con las MARCAS es al revés: son nombres propios, no hay "más simple que" —
// "Goodprotein" no es mejor que "Good Protein" por tener una palabra menos. Ahí
// manda el uso, que es lo que dice cuál es la escritura establecida.
export function valorCanonicoDelGrupo(grupo, categoria) {
  const items = (grupo || []).filter((g) => g && g.value);
  if (!items.length) return null;
  const porUso = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));
  if (categoria === "marca") return porUso[0].value;
  return porUso.reduce((mejor, x) =>
    palabras(x.value).length < palabras(mejor.value).length ? x : mejor, porUso[0]).value;
}

// ── En qué categoría vive de verdad una etiqueta ─────────────────────
// El banco terminó con once valores en dos categorías a la vez: "Bajar de peso"
// como ángulo 186 veces y como nicho 11; "Salud" como nicho 808 y como ángulo
// 449. El prompt ya lo prohíbe —"NO pongas un ángulo de venta como nicho"— pero
// eso es una instrucción al modelo: si la ignora, nada lo corrige.
//
// Esta es la barrera determinista. No mantiene listas de "qué es un nicho": se
// alimenta del uso real, igual que `canonizarEtiqueta`. Si el equipo viene
// usando un valor como ángulo desde hace 400 anuncios, eso ES un ángulo.
//
// Pide una mayoría CLARA (`factor`, 3× por defecto) para no meterse en las
// discusiones legítimas: "Lipodema" está 32 a 25 entre ángulo y subnicho, y ahí
// la respuesta correcta es no tocar nada y que decida una persona.
const CATS_ETIQUETA = ["marca", "nicho", "subnicho", "angulo", "formato"];

export function categoriaDominante(valor, counts = {}, { factor = 3 } = {}) {
  const k = claveEtiqueta(valor);
  if (!k) return null;

  const usos = [];
  for (const cat of CATS_ETIQUETA) {
    let n = 0;
    for (const [v, c] of Object.entries(counts[cat] || {})) if (claveEtiqueta(v) === k) n += c;
    if (n > 0) usos.push({ cat, n });
  }
  if (usos.length < 2) return null;             // en una sola categoría: nada que decidir

  usos.sort((a, b) => b.n - a.n);
  return usos[0].n >= usos[1].n * factor ? usos[0].cat : null;
}

// Las etiquetas que hoy están en más de una categoría, con el conteo a la vista.
// Alimenta la limpieza del banco: `clara` es la que se puede resolver sola,
// `dudosa` la que necesita que alguien decida.
export function etiquetasCruzadas(counts = {}, { factor = 3 } = {}) {
  // Se suma POR CATEGORÍA antes de comparar. Si no, "AG1" (48) y "Ag1" (2) —dos
  // escrituras de la misma marca— salían como "Marca 48 · Marca 2 → Marca": un
  // cruce que no existe y una reubicación que no hace nada. Eso es un duplicado
  // de escritura, y de eso se ocupa el otro panel.
  const porClave = new Map();
  for (const cat of CATS_ETIQUETA) {
    for (const [valor, n] of Object.entries(counts[cat] || {})) {
      const k = claveEtiqueta(valor);
      if (!k) continue;
      if (!porClave.has(k)) porClave.set(k, new Map());
      const porCat = porClave.get(k);
      const ya = porCat.get(cat);
      // Dentro de una categoría gana la escritura más usada, que es la que el
      // equipo reconoce.
      if (!ya || n > ya.n) porCat.set(cat, { cat, valor, n: (ya?.n || 0) + n });
      else ya.n += n;
    }
  }
  const salida = [];
  for (const [, porCat] of porClave) {
    if (porCat.size < 2) continue;                 // vive en una sola categoría
    const usos = [...porCat.values()].sort((a, b) => b.n - a.n);
    const clara = usos[0].n >= usos[1].n * factor;
    salida.push({ valor: usos[0].valor, destino: usos[0].cat, usos, clara });
  }
  return salida.sort((a, b) => (b.usos[0].n + b.usos[1].n) - (a.usos[0].n + a.usos[1].n));
}

// Helpers para manejar la jerarquía de company_task_spaces.
// Un space puede tener parent_id (opcional). El árbol se construye en memoria
// desde el array flat que devuelve la query.

// Arma un árbol de spaces agrupados por parent_id.
// Devuelve array de roots, cada uno con { ...space, children: [] }.
export function buildSpaceTree(spaces) {
  const byId = new Map();
  (spaces || []).forEach((s) => byId.set(s.id, { ...s, children: [] }));
  const roots = [];
  byId.forEach((node) => {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Ordenar por sort_order asc dentro de cada nivel.
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
    arr.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// Aplana el árbol con depth para render. Cada nodo sale con { space, depth }.
export function flattenTree(tree) {
  const out = [];
  const walk = (nodes, depth) => {
    nodes.forEach((n) => {
      const { children, ...rest } = n;
      out.push({ space: rest, depth, hasChildren: children.length > 0 });
      if (children.length) walk(children, depth + 1);
    });
  };
  walk(tree, 0);
  return out;
}

// Retorna todos los IDs de descendientes (incluyendo cualquier profundidad)
// de un space. Usado para evitar ciclos al elegir parent_id.
export function collectDescendantIds(spaces, rootId) {
  const childrenById = new Map();
  (spaces || []).forEach((s) => {
    if (!s.parent_id) return;
    if (!childrenById.has(s.parent_id)) childrenById.set(s.parent_id, []);
    childrenById.get(s.parent_id).push(s.id);
  });
  const out = [];
  const walk = (id) => {
    const kids = childrenById.get(id) || [];
    for (const k of kids) {
      out.push(k);
      walk(k);
    }
  };
  walk(rootId);
  return out;
}

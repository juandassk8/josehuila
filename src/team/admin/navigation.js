// One list for the legacy tabs and the new administration sidebar.
export const ADMIN_SECTIONS = [
  ['overview', 'Resumen', 'dashboard'],
  ['brands', 'Marcas', 'tag'],
  ['requests', 'Solicitudes', 'inbox'],
  ['runs', 'Consultas', 'activity'],
  ['settings', 'Configuración', 'sliders'],
  ['proxies', 'Proxies', 'network'],
  ['apis', 'APIs', 'key'],
  ['audit', 'Actividad', 'history'],
];
export function adminSection(value) {
  return ADMIN_SECTIONS.find(([key]) => key === value) || ADMIN_SECTIONS[0];
}

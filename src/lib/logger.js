// Logger central del cliente. En prod silencia debug/info (ruido en la consola
// del usuario); warn/error siempre pasan. Punto único para, a futuro, enrutar
// errores a un servicio (Sentry, etc.) sin tocar cada call site.
const isDev = import.meta.env.DEV;

export const logger = {
  debug: (...args) => { if (isDev) console.debug(...args); },
  info:  (...args) => { if (isDev) console.info(...args); },
  warn:  (...args) => { console.warn(...args); },
  error: (...args) => { console.error(...args); },
};

export default logger;

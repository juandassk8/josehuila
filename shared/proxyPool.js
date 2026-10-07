export const MAX_PROXY_ROUTES = 10;
export const proxyLabel = index => index === 0 ? 'Principal' : index === 1 ? 'Respaldo' : `Respaldo ${index}`;
export const isProxySlot = value => typeof value === 'string' && /^(primary|backup|proxy-[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/.test(value);

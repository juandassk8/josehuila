import { dateTime } from './adminClient.js';

export function ProxyDiagnostics({ result, compact = false }) {
  if (!result) return null;
  const network = result.network;
  let country = network?.country;
  if (network?.countryCode) try { country = new Intl.DisplayNames(['es'], { type: 'region' }).of(network.countryCode); } catch { /* Provider name is a safe fallback. */ }
  const fields = [
    ['IP de salida', network?.exitIp], ['País', country], ['Región / ciudad', [network?.region, network?.city].filter(Boolean).join(' / ')],
    ['Protocolo del proxy', result.protocol], ['Autenticación', result.authentication === 'username_password' ? 'Usuario y contraseña' : 'Sin credenciales'],
    ['Conexión HTTPS con Meta', result.ok ? 'Verificada' : 'No disponible'],
    ['Tiempo de conexión con Meta', Number.isFinite(result.elapsedMs) ? `${result.elapsedMs} ms` : null],
    ['Proveedor de red (ISP)', network?.isp], ['Organización', network?.organization], ['ASN', network?.asn ? `AS${network.asn}` : null],
    ['Zona horaria', network?.timezone], ['Versión de IP', network?.ipVersion], ['Comprobado', dateTime(result.checkedAt)],
  ];
  const body = <><dl className="ops-proxy-diagnostics">{fields.map(([label, text]) => <div key={label}><dt>{label}</dt><dd>{text || 'No disponible'}</dd></div>)}</dl>
    <p className="ops-note">{network ? 'Ubicación aproximada según ipwho.is. La IP observada puede cambiar si el proveedor rota la salida.' : 'No se pudo obtener la IP de salida y su ubicación. Este resultado es independiente de la conexión con Meta.'}</p></>;
  return compact ? <><strong className="ops-proxy-exit">{network?.exitIp || 'IP de salida no disponible'}</strong>{network && <small>{[country, network.city].filter(Boolean).join(' · ')}</small>}<details className="ops-proxy-details"><summary>Ver información</summary>{body}</details></>
    : <section aria-label="Información del proxy">{body}</section>;
}

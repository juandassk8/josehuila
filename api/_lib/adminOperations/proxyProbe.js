import net from 'node:net';
import tls from 'node:tls';
import https from 'node:https';
import { isPrivateAddress } from '../safeUrl.js';

const TARGET = 'www.facebook.com';
export const PROXY_RESULTS = {
  connected: 'La conexión segura con Meta está disponible. Esto no garantiza que Meta entregue anuncios.',
  auth_failed: 'El proveedor rechazó el usuario o la contraseña.',
  denied: 'El proveedor deniega la conexión. Revisa vigencia, cuota y permisos de la cuenta.',
  unreachable: 'No se pudo abrir la conexión. Revisa la dirección, el puerto y el estado del proveedor.',
  timeout: 'El proxy no respondió a tiempo.',
  tls_failed: 'No se pudo verificar una conexión segura con Meta.',
};
function reader(socket) {
  let buffer = Buffer.alloc(0), pending, failure;
  const settle = () => {
    if (!pending) return;
    if (failure) { const p=pending;pending=null;p.reject(failure);return; }
    const size = typeof pending.until === 'number' ? pending.until : buffer.indexOf(pending.until)+pending.until.length;
    if ((typeof pending.until !== 'number' && size < pending.until.length) || buffer.length<size) return;
    const p=pending;pending=null;const part=buffer.subarray(0,size);buffer=buffer.subarray(size);p.resolve(part);
  };
  const data = chunk => { buffer=Buffer.concat([buffer,chunk]);if(buffer.length>8192) failure=new Error('unreachable');settle(); };
  const end = () => { failure=new Error('unreachable');settle(); };
  socket.on('data',data);socket.on('error',end);socket.on('close',end);
  return { read:until=>new Promise((resolve,reject)=>{pending={until,resolve,reject};settle();}),
    detach:()=>{socket.pause();socket.off('data',data);socket.off('error',end);socket.off('close',end);if(buffer.length) socket.unshift(buffer);} };
}

// Input is already validated and pinned to a public IP. No user-selected destination,
// page download, browser, cookies or raw errors; sockets are bounded and always closed.
export async function probeProxyTunnel(proxy, { connect = net.createConnection, secureConnect = tls.connect, timeoutMs = 10000, network = false } = {}) {
  let socket, secure, timer, timedOut=false;
  // Only two fixed destinations. A caller cannot choose a target or request path.
  const destination = network ? 'ipwho.is' : TARGET;
  const started=Date.now();
  try {
    const url=new URL(proxy.server);
    socket=connect({host:url.hostname,port:Number(url.port || 80)});
    timer=setTimeout(()=>{timedOut=true;secure?.destroy();socket.destroy();},timeoutMs);
    const input=reader(socket);
    await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);socket.once('close',()=>reject(new Error('unreachable')));});
    if(url.protocol==='socks5:') {
      socket.write(Buffer.from([5,1,proxy.username?2:0]));
      const method=await input.read(2);
      if(method[0]!==5 || method[1] !== (proxy.username?2:0)) throw new Error('auth_failed');
      if(proxy.username) {
        const user=Buffer.from(proxy.username),pass=Buffer.from(proxy.password);
        socket.write(Buffer.concat([Buffer.from([1,user.length]),user,Buffer.from([pass.length]),pass]));
        const auth=await input.read(2);if(auth[0]!==1 || auth[1]!==0) throw new Error('auth_failed');
      }
      const target=Buffer.from(destination);
      socket.write(Buffer.concat([Buffer.from([5,1,0,3,target.length]),target,Buffer.from([1,187])]));
      const header=await input.read(4);
      if(header[0]!==5 || header[1]!==0) throw new Error(header[1]===2?'denied':'unreachable');
      const count=header[3]===1?6:header[3]===4?18:header[3]===3?(await input.read(1))[0]+2:0;
      if(!count) throw new Error('unreachable');
      await input.read(count);
    } else if(url.protocol==='http:') {
      const auth=proxy.username ? `Proxy-Authorization: Basic ${Buffer.from(proxy.username+':'+proxy.password).toString('base64')}\r\n` : '';
      socket.write(`CONNECT ${destination}:443 HTTP/1.1\r\nHost: ${destination}:443\r\n${auth}\r\n`);
      const headers=(await input.read('\r\n\r\n')).toString('latin1');
      const status=Number(headers.match(/^HTTP\/1\.[01] (\d{3})\b/)?.[1]);
      if(status!==200) throw new Error(status===407?'auth_failed':status===403?'denied':'unreachable');
    } else throw new Error('unreachable');
    input.detach();
    secure=secureConnect({socket,servername:destination,rejectUnauthorized:true});
    await new Promise((resolve,reject)=>{secure.once('secureConnect',resolve);secure.once('error',()=>reject(new Error('tls_failed')));secure.once('close',()=>reject(new Error('tls_failed')));});
    const details = network ? sanitizeProxyNetwork(await readNetwork(secure)) : null;
    return {ok:true,code:'connected',message:PROXY_RESULTS.connected,elapsedMs:Date.now()-started, ...(network ? { details } : {})};
  } catch(error) {
    const code=timedOut?'timeout':Object.hasOwn(PROXY_RESULTS,error.message)?error.message:'unreachable';
    return {ok:false,code,message:PROXY_RESULTS[code],elapsedMs:Date.now()-started};
  } finally { clearTimeout(timer);secure?.destroy();socket?.destroy(); }
}

function readNetwork(secure) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ keepAlive: false });
    agent.createConnection = () => secure;
    const request = https.get({ hostname: 'ipwho.is', port: 443, path: '/?fields=success,ip,type,country,country_code,region,city,connection,timezone',
      agent, headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', Connection: 'close' } }, response => {
      if (response.statusCode !== 200 || response.headers['content-encoding']) { response.destroy(); reject(Error('NETWORK_LOOKUP_UNAVAILABLE')); return; }
      let bytes = 0; const chunks = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 32768) { response.destroy(); reject(Error('NETWORK_LOOKUP_SIZE')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('aborted', () => reject(Error('NETWORK_LOOKUP_INCOMPLETE')));
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Error('NETWORK_LOOKUP_INVALID')); } });
    });
    request.on('error', reject);
    request.on('close', () => agent.destroy());
  });
}

export function sanitizeProxyNetwork(raw) {
  if (raw?.success !== true || !net.isIP(raw.ip) || isPrivateAddress(raw.ip)) throw Error('NETWORK_LOOKUP_INVALID');
  const text = value => typeof value === 'string' ? [...value].filter(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join('').trim().slice(0, 160) || null : null;
  return { exitIp: raw.ip, ipVersion: net.isIP(raw.ip) === 6 ? 'IPv6' : 'IPv4', country: text(raw.country),
    countryCode: /^[A-Z]{2}$/.test(raw.country_code) ? raw.country_code : null, region: text(raw.region), city: text(raw.city),
    isp: text(raw.connection?.isp), organization: text(raw.connection?.org),
    asn: Number.isSafeInteger(raw.connection?.asn) && raw.connection.asn > 0 ? raw.connection.asn : null,
    timezone: text(raw.timezone?.id), provider: 'ipwho.is' };
}

export async function probeProxy(proxy, { probe = probeProxyTunnel } = {}) {
  const [meta, network] = await Promise.all([probe(proxy), probe(proxy, { network: true })]);
  return { ...meta, checkedAt: new Date().toISOString(), protocol: new URL(proxy.server).protocol.slice(0, -1).toUpperCase(),
    authentication: proxy.username ? 'username_password' : 'none',
    network: network.ok && network.details ? network.details : null,
    networkStatus: network.ok && network.details ? 'available' : 'unavailable' };
}

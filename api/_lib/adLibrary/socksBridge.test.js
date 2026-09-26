import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startSocksBridge } from './socksBridge.js';

const cleanup = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()(); });
const listen = async server => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise(resolve => server.close(() => resolve())));
  return server.address().port;
};

// Destino local que responde con eco, y un proxy SOCKS5 falso que exige usuario/contraseña.
async function echoTarget() {
  return listen(net.createServer(socket => { socket.on('error', () => {}); socket.pipe(socket); }));
}
async function fakeSocks({ username = 'user', password = 'secret', targetPort }) {
  const seen = [];
  const port = await listen(net.createServer(socket => {
    socket.on('error', () => {});
    let stage = 'greet';
    socket.on('data', function onData(chunk) {
      if (stage === 'greet') { socket.write(Buffer.from([5, chunk.subarray(2).includes(2) ? 2 : 0xff])); stage = 'auth'; return; }
      if (stage === 'auth') {
        const ulen = chunk[1], user = chunk.subarray(2, 2 + ulen).toString(), pass = chunk.subarray(3 + ulen, 3 + ulen + chunk[2 + ulen]).toString();
        const ok = user === username && pass === password;
        socket.write(Buffer.from([1, ok ? 0 : 1])); if (!ok) socket.end(); stage = 'request'; return;
      }
      socket.off('data', onData);
      const host = chunk.subarray(5, 5 + chunk[4]).toString(), port = chunk.readUInt16BE(5 + chunk[4]);
      seen.push({ host, port });
      const upstream = net.connect({ host: '127.0.0.1', port: targetPort }, () => {
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        socket.pipe(upstream).pipe(socket);
      });
      upstream.on('error', () => socket.destroy());
    });
  }));
  return { port, seen };
}
function connectThrough(bridge, requestLine) {
  const { port } = new URL(bridge.server);
  const client = net.connect({ host: '127.0.0.1', port: Number(port) });
  client.on('error', () => {});
  client.write(requestLine);
  let data = '';
  const next = pattern => new Promise((resolve, reject) => {
    const check = () => { if (pattern.test(data)) { client.off('data', onData); resolve(data); } };
    const onData = chunk => { data += chunk.toString(); check(); };
    client.on('data', onData); client.once('close', () => (pattern.test(data) ? resolve(data) : reject(new Error(`closed: ${data}`)))); check();
  });
  return { client, next };
}

describe('SOCKS5 bridge for Chromium', () => {
  it('tunnels CONNECT through an authenticated SOCKS5 proxy with remote DNS', async () => {
    const targetPort = await echoTarget();
    const socks = await fakeSocks({ targetPort });
    const bridge = await startSocksBridge({ host: '127.0.0.1', port: socks.port, username: 'user', password: 'secret' });
    cleanup.push(bridge.close);
    const { client, next } = connectThrough(bridge, 'CONNECT www.facebook.com:443 HTTP/1.1\r\nHost: www.facebook.com:443\r\n\r\n');
    expect(await next(/200 Connection Established\r\n\r\n/)).toMatch(/^HTTP\/1\.1 200/);
    client.write('ping');
    expect(await next(/ping$/)).toMatch(/ping$/);
    expect(socks.seen).toEqual([{ host: 'www.facebook.com', port: 443 }]);
    client.destroy();
  });
  it('answers 502 when the proxy rejects the credentials, so the collector sees a proxy failure', async () => {
    const socks = await fakeSocks({ targetPort: await echoTarget() });
    const bridge = await startSocksBridge({ host: '127.0.0.1', port: socks.port, username: 'user', password: 'wrong' });
    cleanup.push(bridge.close);
    expect(await connectThrough(bridge, 'CONNECT www.facebook.com:443 HTTP/1.1\r\n\r\n').next(/502/)).toMatch(/^HTTP\/1\.1 502/);
    expect(socks.seen).toEqual([]);
  });
  it('answers 502 when the proxy is down', async () => {
    const closed = net.createServer(); await new Promise(r => closed.listen(0, '127.0.0.1', r));
    const port = closed.address().port; await new Promise(r => closed.close(r));
    const bridge = await startSocksBridge({ host: '127.0.0.1', port, username: 'u', password: 'p' });
    cleanup.push(bridge.close);
    expect(await connectThrough(bridge, 'CONNECT www.facebook.com:443 HTTP/1.1\r\n\r\n').next(/502/)).toMatch(/^HTTP\/1\.1 502/);
  });
  it('refuses plain HTTP requests and ports other than HTTPS', async () => {
    const bridge = await startSocksBridge({ host: '127.0.0.1', port: 9, username: 'u', password: 'p' });
    cleanup.push(bridge.close);
    expect(await connectThrough(bridge, 'GET http://example.com/ HTTP/1.1\r\n\r\n').next(/405/)).toMatch(/^HTTP\/1\.1 405/);
    expect(await connectThrough(bridge, 'CONNECT example.com:25 HTTP/1.1\r\n\r\n').next(/403/)).toMatch(/^HTTP\/1\.1 403/);
  });
  it('can restrict tunnels to the source domains', async () => {
    const bridge = await startSocksBridge({ host: '127.0.0.1', port: 9, username: 'u', password: 'p' }, { allowedHosts: /(^|\.)facebook\.com$/ });
    cleanup.push(bridge.close);
    expect(await connectThrough(bridge, 'CONNECT www.gstatic.com:443 HTTP/1.1\r\n\r\n').next(/403/)).toMatch(/^HTTP\/1\.1 403/);
    expect(await connectThrough(bridge, 'CONNECT facebook.com.evil.test:443 HTTP/1.1\r\n\r\n').next(/403/)).toMatch(/^HTTP\/1\.1 403/);
  });
  it('listens only on loopback', async () => {
    const bridge = await startSocksBridge({ host: '127.0.0.1', port: 9, username: 'u', password: 'p' });
    cleanup.push(bridge.close);
    expect(new URL(bridge.server).hostname).toBe('127.0.0.1');
  });
});

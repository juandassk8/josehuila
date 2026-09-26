import net from 'node:net';

// Chromium no implementa SOCKS5 con usuario/contraseña (RFC 1929). Este puente
// escucha solo en 127.0.0.1, recibe túneles HTTP CONNECT del navegador sin
// credenciales y los abre en el proxy SOCKS5 autenticado. La resolución DNS la
// hace el proxy (dirección por nombre), y las credenciales nunca salen del proceso.

function bufferedReader(socket) {
  let buffer = Buffer.alloc(0), waiting = null, failure = null;
  const settle = () => {
    if (!waiting) return;
    if (failure) { const { reject } = waiting; waiting = null; return reject(failure); }
    const size = typeof waiting.until === 'number' ? waiting.until : buffer.indexOf(waiting.until) + waiting.until.length;
    if (typeof waiting.until !== 'number' && size < waiting.until.length) {
      if (buffer.length > waiting.max) { const { reject } = waiting; waiting = null; reject(new Error('BRIDGE_HEADER_TOO_LARGE')); }
      return;
    }
    if (buffer.length < size) return;
    const out = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    const { resolve } = waiting; waiting = null; resolve(out);
  };
  const onData = chunk => { buffer = Buffer.concat([buffer, chunk]); settle(); };
  const onEnd = error => { failure = error instanceof Error ? error : new Error('BRIDGE_CLOSED'); settle(); };
  socket.on('data', onData); socket.on('error', onEnd); socket.on('close', onEnd);
  return {
    read: (until, max = 8192) => new Promise((resolve, reject) => { waiting = { until, max, resolve, reject }; settle(); }),
    release() {
      socket.off('data', onData); socket.off('error', onEnd); socket.off('close', onEnd);
      const rest = buffer; buffer = Buffer.alloc(0); return rest;
    },
  };
}

export async function openSocksTunnel({ host, port, username, password }, target, { timeoutMs = 15_000 } = {}) {
  const user = Buffer.from(username), pass = Buffer.from(password), name = Buffer.from(target.host);
  if (!user.length || user.length > 255 || !pass.length || pass.length > 255 || !name.length || name.length > 255) throw new Error('SOCKS_INVALID_REQUEST');
  const socket = net.connect({ host, port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SOCKS_TIMEOUT')));
  const reader = bufferedReader(socket);
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    socket.write(Buffer.from([5, 1, 2]));
    const method = await reader.read(2);
    if (method[0] !== 5 || method[1] !== 2) throw new Error('SOCKS_AUTH_METHOD_REJECTED');
    socket.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
    const auth = await reader.read(2);
    if (auth[1] !== 0) throw new Error('SOCKS_AUTH_FAILED');
    socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([target.port >> 8, target.port & 255])]));
    const head = await reader.read(5);
    if (head[0] !== 5 || head[1] !== 0) throw new Error('SOCKS_CONNECT_FAILED');
    const remaining = { 1: 3 + 2, 3: head[4] + 2, 4: 15 + 2 }[head[3]];
    if (remaining === undefined) throw new Error('SOCKS_BAD_REPLY');
    await reader.read(remaining);
    socket.setTimeout(0);
    return { socket, rest: reader.release() };
  } catch (error) {
    reader.release(); socket.destroy();
    throw error;
  }
}

const CONNECT_LINE = /^CONNECT ([a-z0-9.-]{1,253}):(\d{1,5}) HTTP\/1\.[01]\r\n/i;

export async function startSocksBridge(upstream, { allowedPorts = [443], allowedHosts = null, timeoutMs = 15_000 } = {}) {
  const sockets = new Set();
  const server = net.createServer(async client => {
    sockets.add(client); client.on('close', () => sockets.delete(client));
    client.on('error', () => {});
    const reader = bufferedReader(client);
    let tunnel;
    try {
      const header = (await reader.read(Buffer.from('\r\n\r\n'))).toString('latin1');
      const match = CONNECT_LINE.exec(header);
      if (!match) { client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n'); return; }
      const target = { host: match[1].toLowerCase(), port: Number(match[2]) };
      if (!allowedPorts.includes(target.port) || (allowedHosts && !allowedHosts.test(target.host))) { client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
      tunnel = await openSocksTunnel(upstream, target, { timeoutMs });
      sockets.add(tunnel.socket); tunnel.socket.on('close', () => sockets.delete(tunnel.socket));
      const early = reader.release();
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (tunnel.rest.length) client.write(tunnel.rest);
      if (early.length) tunnel.socket.write(early);
      tunnel.socket.on('error', () => client.destroy());
      client.on('error', () => tunnel.socket.destroy());
      client.pipe(tunnel.socket).pipe(client);
    } catch {
      // Chromium lo reporta como ERR_TUNNEL_CONNECTION_FAILED: el collector lo trata como proxy caído.
      if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    server: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()); }),
  };
}

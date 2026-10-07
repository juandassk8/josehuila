import { EventEmitter } from 'node:events';
import { describe,it,expect,vi } from 'vitest';
import { probeProxyTunnel as probeProxy } from './proxyProbe.js';
function harness(replies,{tlsFailure=false}={}) {
  const socket=new EventEmitter();socket.write=vi.fn(()=>{const reply=replies.shift();if(reply)queueMicrotask(()=>socket.emit('data',Buffer.from(reply)));});
  socket.destroy=vi.fn(()=>socket.emit('close'));socket.pause=vi.fn();socket.unshift=vi.fn();
  const connect=vi.fn(()=>{queueMicrotask(()=>socket.emit('connect'));return socket;});
  const tls=new EventEmitter();tls.destroy=vi.fn(()=>tls.emit('close'));
  const secureConnect=vi.fn(()=>{queueMicrotask(()=>tls.emit(tlsFailure?'error':'secureConnect',new Error('private-error')));return tls;});
  return {socket,tls,connect,secureConnect,timeoutMs:100};
}
describe('bounded proxy connection probe',()=>{
  it('performs SOCKS authentication and verifies target TLS without fetching ads',async()=>{
    const h=harness([[5,2],[1,0],[5,0,0,1,0,0,0,0,0,0]]);
    expect(await probeProxy({server:'socks5://1.1.1.1:1080',username:'user',password:'secret'},h)).toMatchObject({ok:true,code:'connected'});
    expect(h.secureConnect).toHaveBeenCalledWith({socket:h.socket,servername:'www.facebook.com',rejectUnauthorized:true});
    expect(h.socket.destroy).toHaveBeenCalled();expect(h.tls.destroy).toHaveBeenCalled();
  });
  it.each([[ [5,2],[1,1] ],[ [5,255] ]])('recognizes authentication failures %j',async(...replies)=>{
    const h=harness(replies);expect((await probeProxy({server:'socks5://1.1.1.1:1080',username:'user',password:'secret'},h)).code).toBe('auth_failed');
    expect(h.secureConnect).not.toHaveBeenCalled();
  });
  it('distinguishes provider restrictions from Meta rate limits',async()=>{
    const h=harness([[5,0],[5,2,0,1]]);
    expect((await probeProxy({server:'socks5://1.1.1.1:1080'},h)).code).toBe('denied');
  });
  it.each([[200,'connected'],[403,'denied'],[407,'auth_failed'],[502,'unreachable']])('handles HTTP CONNECT %i safely',async(status,code)=>{
    const h=harness([Buffer.from(`HTTP/1.1 ${status} Test\r\n\r\n`)]);
    const result=await probeProxy({server:'http://1.1.1.1:8000',username:'user',password:'secret'},h);
    expect(result.code).toBe(code);expect(JSON.stringify(result)).not.toContain('secret');expect(h.socket.destroy).toHaveBeenCalled();
  });
  it('bounds response size/time and closes timed out sockets',async()=>{
    const h=harness([]);const result=await probeProxy({server:'http://1.1.1.1:8000'},h);
    expect(result.code).toBe('timeout');expect(h.socket.destroy).toHaveBeenCalled();
    const huge=harness([Buffer.from('x'.repeat(9000))]);expect((await probeProxy({server:'http://1.1.1.1:8000'},huge)).code).toBe('unreachable');
  });
  it('does not accept an invalid target certificate',async()=>{
    const h=harness([Buffer.from('HTTP/1.1 200 OK\r\n\r\n')],{tlsFailure:true});
    expect((await probeProxy({server:'http://1.1.1.1:8000'},h)).code).toBe('tls_failed');
  });
});

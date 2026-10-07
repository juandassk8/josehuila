import { describe, it, expect, vi } from 'vitest';
import { encryptProxies,decryptProxies,prepareProxy,resolveProxy,readProxySettings,loadCollectionProxies,saveProxySettings,prepareProxyTest } from './proxies.js';
const env={ADLIB_PROXY_ENCRYPTION_KEY:'a'.repeat(64)};
const original=[{server:'socks5://8.8.8.8:45001',username:'private-user',password:'private-password'}];
const row=(patch={})=>({revision:2,encrypted_value:encryptProxies(original,env),routes:[{slot:'primary',server:original[0].server,hasCredentials:true}],...patch});
function client(value) {
  const query={select:()=>query,eq:()=>query,single:async()=>({data:value})};
  return {from:()=>query,rpc:vi.fn(async()=>({data:{revision:3,updated_at:'2026-10-02T15:00:00Z'}}))};
}
const draft={slot:'primary',server:original[0].server,credentials:'keep'};
describe('proxy configuration',()=>{
  it('encrypts with authenticated randomized envelopes and rejects wrong keys/tampering',()=>{
    const a=encryptProxies(original,env),b=encryptProxies(original,env);
    expect(a).not.toEqual(b);expect(a).not.toMatch(/private|8\.8\.8\.8/);expect(decryptProxies(a,env)).toEqual(original);
    expect(()=>decryptProxies(a,{ADLIB_PROXY_ENCRYPTION_KEY:'b'.repeat(64)})).toThrow('PROXY_CONFIGURATION_UNAVAILABLE');
    expect(()=>decryptProxies(a.slice(0,-4)+'AAAA',env)).toThrow('PROXY_CONFIGURATION_UNAVAILABLE');
    expect(()=>encryptProxies(original,{})).toThrow('PROXY_KEY_UNAVAILABLE');
  });
  it.each(['socks5://127.0.0.1:1','http://10.0.0.1:80','http://169.254.169.254:80','http://2130706433:80','http://[::ffff:127.0.0.1]:80',
    'file:///etc/passwd','https://8.8.8.8:443','http://u:p@8.8.8.8:80','http://8.8.8.8:80/path','http://8.8.8.8'])('rejects unsafe/unsupported address %s',async server=>{
    await expect(resolveProxy({server})).rejects.toThrow();
  });
  it('pins public DNS, supports port80, rejects mixed private answers and never resolves again during use',async()=>{
    const lookupFn=vi.fn(async()=>[{address:'1.1.1.1'}]);
    expect((await resolveProxy({server:'http://proxy.example:80'},{lookupFn})).server).toBe('http://1.1.1.1:80');
    lookupFn.mockResolvedValueOnce([{address:'8.8.8.8'},{address:'192.168.0.1'}]);
    await expect(resolveProxy({server:'socks5://proxy.example:1080'},{lookupFn})).rejects.toThrow('pública');
  });
  it('retains passwords only for the same endpoint and validates credential pairs',async()=>{
    const resolve=vi.fn(async p=>p);
    expect((await prepareProxy(draft,original[0],resolve)).proxy).toEqual(original[0]);
    await expect(prepareProxy({...draft,server:'socks5://1.1.1.1:1080'},original[0],resolve)).rejects.toThrow('dirección');
    await expect(prepareProxy({...draft,credentials:'replace',username:'user',password:''},null,resolve)).rejects.toThrow('Completa');
    await expect(prepareProxy({...draft,credentials:'replace',username:'user',password:'bad\r\n'},null,resolve)).rejects.toThrow('Completa');
    expect((await prepareProxy({...draft,credentials:'none'},null,resolve)).proxy).toEqual({server:draft.server});
  });
  it('returns safe metadata only and indicates missing encryption setup',async()=>{
    const info=await readProxySettings(client(row()),env);
    expect(JSON.stringify(info)).not.toMatch(/private|encrypted_value/);expect(info.writable).toBe(true);
    expect((await readProxySettings(client(row()),{})).writable).toBe(false);
  });
  it('supports legacy routes until a save and fails closed when managed secrets cannot decrypt',async()=>{
    const legacy={ADLIB_PROXY_SERVER:'http://8.8.8.8:8000',ADLIB_PROXY_USERNAME:'legacy',ADLIB_PROXY_PASSWORD:'secret'};
    expect((await loadCollectionProxies(client(row({encrypted_value:null,revision:0})),legacy)).proxies[0].username).toBe('legacy');
    await expect(loadCollectionProxies(client(row()),legacy)).rejects.toThrow('PROXY_CONFIGURATION_UNAVAILABLE');
  });
  it('atomically saves ciphertext and sanitized audit metadata using authenticated actor',async()=>{
    const db=client(row()),resolve=async p=>p;
    const info=await saveProxySettings({revision:2,routes:[draft]},'actor',{client:db,env,resolve});
    const args=db.rpc.mock.calls[0][1];expect(args.p_actor).toBe('actor');expect(args.p_revision).toBe(2);
    expect(decryptProxies(args.p_encrypted,env)).toEqual([{...original[0],slot:'primary'}]);
    expect(JSON.stringify(args.p_routes)+JSON.stringify(info)).not.toMatch(/private|password|username/);
  });
  it('rejects stale/empty/duplicate routes without writes, preserving current proxies',async()=>{
    const db=client(row()),resolve=async p=>p;
    await expect(saveProxySettings({revision:1,routes:[draft]},'actor',{client:db,env,resolve})).rejects.toMatchObject({status:409});
    await expect(saveProxySettings({revision:2,routes:[]},'actor',{client:db,env,resolve})).rejects.toThrow('principal');
    await expect(saveProxySettings({revision:2,routes:[draft,{...draft,slot:'backup',credentials:'replace',username:original[0].username,password:original[0].password}]},'actor',{client:db,env,resolve})).rejects.toThrow('diferente');
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('maps concurrent DB conflicts and never exposes errors or ciphertext',async()=>{
    const db=client(row());db.rpc.mockResolvedValue({error:{code:'40001',message:'secret'}});
    await expect(saveProxySettings({revision:2,routes:[draft]},'actor',{client:db,env,resolve:async p=>p})).rejects.toMatchObject({status:409});
  });
  it('prepares a draft test using preserved credentials without saving it',async()=>{
    const db=client(row());expect(await prepareProxyTest({revision:2,route:draft},{client:db,env,resolve:async p=>p})).toEqual(original[0]);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('adds a third proxy without returning or replacing the first two credentials',async()=>{
    const second={server:'http://1.1.1.1:8000',username:'second-user',password:'second-secret'};
    const db=client(row({encrypted_value:encryptProxies([...original,second],env)}));
    const third={slot:'proxy-00000000-0000-0000-0000-000000000003',server:'http://8.8.4.4:8000',credentials:'replace',username:'third-user',password:'third-secret'};
    const info=await saveProxySettings({revision:2,routes:[draft,{slot:'backup',server:second.server,credentials:'keep'},third]},'actor',{client:db,env,resolve:async p=>p});
    const stored=decryptProxies(db.rpc.mock.calls[0][1].p_encrypted,env);
    expect(stored.map(p=>p.password)).toEqual(['private-password','second-secret','third-secret']);
    expect(info.routes).toHaveLength(3);expect(info.maxRoutes).toBe(10);expect(JSON.stringify(info)).not.toMatch(/secret|password|username/);
    const loaded=await loadCollectionProxies(client(row({encrypted_value:db.rpc.mock.calls[0][1].p_encrypted})),env);
    expect(loaded.proxies).toHaveLength(3);expect(loaded.proxies.map(p=>p.slot)).toEqual([undefined,undefined,undefined]);
  });
  it('retains the right credentials after removing a middle route and tests by stable identifier',async()=>{
    const saved=[{...original[0],slot:'primary'},{slot:'backup',server:'http://1.1.1.1:8000',username:'removed',password:'removed-secret'},
      {slot:'proxy-00000000-0000-0000-0000-000000000003',server:'http://8.8.4.4:8000',username:'third',password:'third-secret'}];
    const db=client(row({encrypted_value:encryptProxies(saved,env)}));
    const keep={slot:saved[2].slot,server:saved[2].server,credentials:'keep'};
    expect((await prepareProxyTest({revision:2,route:keep},{client:db,env,resolve:async p=>p})).password).toBe('third-secret');
    await saveProxySettings({revision:2,routes:[draft,keep]},'actor',{client:db,env,resolve:async p=>p});
    expect(decryptProxies(db.rpc.mock.calls[0][1].p_encrypted,env).map(p=>p.password)).toEqual(['private-password','third-secret']);
    await expect(saveProxySettings({revision:2,routes:[draft,{...keep,slot:'proxy-00000000-0000-0000-0000-000000000004'}]},'actor',{client:db,env,resolve:async p=>p})).rejects.toThrow('dirección');
  });
  it('accepts ten routes, rejects eleven, invalid or duplicate identities and nonadjacent duplicates',async()=>{
    const routes=Array.from({length:10},(_,i)=>({slot:i?`proxy-00000000-0000-0000-0000-${String(i).padStart(12,'0')}`:'primary',server:`http://8.8.8.${i+1}:8000`,credentials:'none'}));
    const db=client(row()),options={client:db,env,resolve:async p=>p};
    expect((await saveProxySettings({revision:2,routes},'actor',options)).routes).toHaveLength(10);
    for(const bad of [[...routes,{...routes[1],slot:'backup'}],[routes[0],{...routes[1],slot:'other'}],[routes[0],{...routes[1],slot:'primary'}]])
      await expect(saveProxySettings({revision:2,routes:bad},'actor',options)).rejects.toMatchObject({status:400});
    await expect(saveProxySettings({revision:2,routes:[...routes.slice(0,3),{...routes[0],slot:'backup'}]},'actor',options)).rejects.toThrow('diferente');
  });
});

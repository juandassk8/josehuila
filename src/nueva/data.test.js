import { describe, expect, it, vi } from 'vitest';
import { createDataClient } from '../../shared/postgres-client.js';
import { deleteBrandDocument, loadUniverse, loadWorkspace, saveBrandDocument, saveVoice } from './data.js';
import { selectedCompany } from './model.js';
vi.mock('../lib/backend.js', () => ({ database:{} }));
function clientWith(handle) {
  const seen=[];
  const client=createDataClient('https://fixture.invalid/backend',{fetch:async (url,options)=>{
    const request={url:new URL(url),...options,body:options.body?JSON.parse(options.body):null}; seen.push(request);
    const output=await handle(request);
    return new Response(JSON.stringify(output?.body ?? output ?? []),{status:output?.status || 200});
  }});
  return {client,seen};
}
describe('existing backend adapters for nueva',()=>{
  it('saves document text in legacy and current columns without sending large text in the URL', async () => {
    const { client, seen } = clientWith(() => [{ id: 'doc', updated_at: 'new' }]);
    await saveBrandDocument('co', { id: 'doc', updated_at: 'old', raw_content: 'x'.repeat(190000) }, { title: 'Manual', content: 'New' }, client);
    expect(seen[0].url.searchParams.get('company_id')).toBe('eq.co');
    expect(seen[0].url.searchParams.get('updated_at')).toBe('eq.old');
    expect(seen[0].url.href.length).toBeLessThan(500);
    expect(seen[0].body).toEqual({ title: 'Manual', content: 'New', raw_content: 'New', extracted_summary: null });
  });
  it('retains optimistic locking for document edit and removal', async () => {
    const { client, seen } = clientWith(() => []);
    await expect(saveBrandDocument('co', { id: 'd', updated_at: 'old' }, { title: 'T', content: 'C' }, client)).rejects.toThrow('cambió');
    await expect(deleteBrandDocument('co', { id: 'd', updated_at: 'old' }, client)).rejects.toThrow('cambió');
    expect(seen.every(row => row.url.searchParams.get('company_id') === 'eq.co')).toBe(true);
  });
  it('loads only the selected company profile, voice and documents',async()=>{
    const {client,seen}=clientWith(()=>[]);
    expect(await loadUniverse('company-a',client)).toEqual({voice:null,profile:[],documents:[]});
    expect(seen).toHaveLength(3);
    expect(seen.every(row=>row.url.searchParams.get('company_id')==='eq.company-a')).toBe(true);
  });
  it('shows failures instead of replacing inaccessible data with an empty profile',async()=>{
    const {client}=clientWith(()=>({status:403,body:{message:'No access'}}));
    await expect(loadUniverse('foreign',client)).rejects.toThrow('No access');
  });
  it('paginates accessible companies and excludes archived ones',async()=>{
    const {client,seen}=clientWith(({url})=>{
      if(!url.pathname.endsWith('companies'))return [];
      return url.searchParams.get('offset')==='0'?Array.from({length:500},(_,id)=>({id,archived:id===0})):[{id:501}];
    });
    const result=await loadWorkspace({id:'user-a'},client);
    expect(result.companies).toHaveLength(500);
    expect(seen.find(row=>row.url.pathname.endsWith('team_members')).url.searchParams.get('id')).toBe('eq.user-a');
    expect(seen.find(row=>row.url.pathname.endsWith('company_team_members')).url.searchParams.get('auth_user_id')).toBe('eq.user-a');
  });
  it.each([
    [{role:'admin',active:true},true],
    [{role:'admin',active:false},false],
    [{role:'member',active:true},false],
    [null,false],
  ])('keeps archived workspaces accessible only to an active platform admin (%j)',async(member,canSeeArchived)=>{
    const archived={id:'inforce',name:'Inforce',archived:true};
    const active={id:'pruebas',name:'Peluna Pets — Pruebas',archived:false};
    const {client,seen}=clientWith(({url})=>{
      if(url.pathname.endsWith('/team_members'))return member?[member]:[];
      if(url.pathname.endsWith('/companies'))return [archived,active];
      return [];
    });
    const result=await loadWorkspace({id:'user-a'},client);
    expect(result.companies).toEqual(canSeeArchived?[active,archived]:[active]);
    expect(selectedCompany(result.companies,null)).toEqual(active);
    expect(selectedCompany(result.companies,'inforce')).toEqual(canSeeArchived?archived:active);
    expect(selectedCompany(result.companies,'unauthorized')).toEqual(active);
    expect(seen.every(request=>request.method==='GET')).toBe(true);
  });
  it('preserves fields outside the edit and sends the snapshot version on updates',async()=>{
    const {client,seen}=clientWith(()=>[{id:'profile',tone_notes:'Cercano',products:[{id:'a',touchpoints:{angles:[]}}]}]);
    await saveVoice('co',{id:'profile',updated_at:'2026-10-06T12:00:00Z'},{tone_notes:'Cercano',company_id:'foreign',id:'evil',products:undefined},client);
    expect(seen[0].url.searchParams.get('company_id')).toBe('eq.co');
    expect(seen[0].url.searchParams.get('updated_at')).toBe('eq.2026-10-06T12:00:00Z');
    expect(seen[0].body).not.toHaveProperty('company_id');
    expect(seen[0].body).not.toHaveProperty('products');
    expect(seen[0].body.tone_notes).toBe('Cercano');
  });
  it('reports a concurrent change when no row matches the snapshot',async()=>{
    const {client}=clientWith(()=>[]);
    await expect(saveVoice('co',{id:'p',updated_at:'old'},{niche:'mascotas'},client)).rejects.toThrow('Otra persona');
  });
  it('handles simultaneous first creation without overwriting the existing profile',async()=>{
    const {client}=clientWith(()=>({status:409,body:{code:'23505'}}));
    await expect(saveVoice('co',null,{niche:'mascotas'},client)).rejects.toThrow('Otra persona');
  });
});

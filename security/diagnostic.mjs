// Diagnóstico activo: solo fixtures propios. No usar contra otra instalación.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
if (process.env.SECURITY_AUDIT_ALLOW_FIXTURES !== '1') throw new Error('Se requiere SECURITY_AUDIT_ALLOW_FIXTURES=1');
const env = Object.fromEntries((await readFile('/etc/inforce/api.env','utf8')).split('\n').filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
const base='http://127.0.0.1:3001', service=env.BACKEND_SERVICE_KEY;
const run=randomUUID(), users=[], files=[], companyIds=['security-a-'+run,'security-b-'+run];
let spaceId, taskId;
const results=[];
function record(name, result) { results.push({name,...result}); console.log(JSON.stringify(results.at(-1))); }
async function request(path,method='GET',body,token=service) {
 const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text(); let data; try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data};
}
const rest=(path,method='GET',body,token=service)=>request('/backend/rest/v1/'+path,method,body,token);
const login=(email,password)=>request('/backend/auth/v1/token?grant_type=password','POST',{email,password},null);
try {
 for(const role of ['admin','editor','owner','victim']) {
  const password=randomUUID(), email=`security-${role}-${run}@example.invalid`;
  const r=await request('/backend/auth/v1/admin/users','POST',{email,password});
  assert.equal(r.status,200); const user={...r.data.user,password,role}; users.push(user);
  if(['admin','editor'].includes(role)) assert.equal((await rest('team_members','POST',{id:user.id,email,name:'Security fixture',role,active:true})).status,201);
  const session=await login(email,password); assert.equal(session.status,200); user.token=session.data.access_token;
 }
 const [admin,editor,owner,victim]=users;
 for(const [i,user] of [[0,owner],[1,victim]]) assert.equal((await rest('companies','POST',{id:companyIds[i],slug:companyIds[i],name:'Security fixture',owner_user_id:user.id})).status,201);
 const anonymous=await rest('companies?select=id','GET',undefined,null);
 const tenant=await rest(`companies?id=eq.${companyIds[1]}`,'GET',undefined,owner.token);
 const elevate=await rest(`team_members?id=eq.${editor.id}`,'PATCH',{role:'admin'},editor.token);
 const selfLink=await rest('client_users','POST',{user_id:owner.id,company_id:companyIds[1]},owner.token);
 record('baseline_isolation',{anonymous:anonymous.status,otherCompanyRows:tenant.data.length,selfElevate:elevate.status,selfLink:selfLink.status});

 // Solo se intenta tomar una cuenta administradora DE PRUEBA.
 const forged=await rest('company_team_members','POST',{company_id:companyIds[0],name:'Fixture identity mismatch',email:`unrelated-${run}@example.invalid`,auth_user_id:admin.id},owner.token);
 assert.equal(forged.status,201,JSON.stringify(forged.data));
 const resetAdmin=await request('/api/admin-create-client-user','POST',{action:'reset-member',memberId:forged.data[0].id},owner.token);
 let takeover=false;
 if(resetAdmin.status===200 && resetAdmin.data.password) {
  const newSession=await login(admin.email,resetAdmin.data.password);
  takeover=newSession.status===200 && newSession.data.user.id===admin.id;
 }
 record('owner_resets_unrelated_admin_fixture',{forgedLink:forged.status,reset:resetAdmin.status,confirmedTakeover:takeover});

 const nextPassword=randomUUID();
 const resetOther=await request('/api/admin-create-client-user','POST',{companyId:companyIds[1],newPassword:nextPassword},editor.token);
 const otherLogin=await login(victim.email,nextPassword);
 record('editor_resets_other_company_owner',{reset:resetOther.status,confirmedTakeover:otherLogin.status===200});
 const ob=await request('/api/onboarding-form','POST',{action:'usuarios',companyId:companyIds[1]},editor.token);
 record('editor_reads_other_company_onboarding_users',{status:ob.status,returnedUsers:ob.data?.usuarios?.length});

 const s=await rest('spaces','POST',{name:'Security fixture',visibility:'private',owner_id:editor.id}); spaceId=s.data[0].id;
 const t=await rest('tasks','POST',{title:'Security fixture',space_id:spaceId,created_by:editor.id}); taskId=t.data[0].id;
 await rest(`team_members?id=eq.${editor.id}`,'PATCH',{active:false});
 const inactive=await rest(`tasks?id=eq.${taskId}`,'PATCH',{title:'Inactive fixture changed'},editor.token);
 record('inactive_editor_still_writes_own_tasks',{status:inactive.status,changed:inactive.data?.[0]?.title==='Inactive fixture changed'});
 await rest(`team_members?id=eq.${editor.id}`,'PATCH',{active:true});

 // Prueba SSRF solo contra healthz de ESTA aplicación, nunca metadata u otros hosts.
 const localUrl=base+'/healthz';
 const ssrf=await request('/api/rehost-covers','POST',{urls:[localUrl]},editor.token);
 const published=ssrf.data?.covers?.[localUrl];
 let leaked=false;
 if(published) {
  const url=new URL(published);
  const prefix='/backend/storage/v1/object/public/despliegue-examples/';
  const path=decodeURIComponent(url.pathname.slice(prefix.length)); files.push(path);
  const read=await fetch(base+url.pathname); const body=await read.text(); leaked=body.includes('"status":"ok"');
 }
 record('ssrf_loopback_health_published',{status:ssrf.status,internalResponsePublic:leaked});

 const forgedJwt=await request('/backend/auth/v1/user','GET',undefined,owner.token+'x');
 record('tampered_jwt',{status:forgedJwt.status});
} finally {
 for(const path of files) await request('/backend/storage/v1/object/despliegue-examples','DELETE',{prefixes:[path]});
 if(taskId) await rest('tasks?id=eq.'+taskId,'DELETE');
 if(spaceId) await rest('spaces?id=eq.'+spaceId,'DELETE');
 for(const id of companyIds) {
  await rest('company_team_members?company_id=eq.'+id,'DELETE');
  await rest('client_users?company_id=eq.'+id,'DELETE');
  await rest('companies?id=eq.'+id,'DELETE');
 }
 for(const u of users) await request('/backend/auth/v1/admin/users/'+u.id,'DELETE');
 record('cleanup',{fixtureUsers:users.length,fixtureCompanies:companyIds.length});
}

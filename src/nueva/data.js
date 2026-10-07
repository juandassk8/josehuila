import { database } from '../lib/backend.js';
import { isPlatformAdmin } from './model.js';
function checked(result) {
  if (result.error) throw new Error(result.error.message || 'No pudimos cargar la información.');
  return result.data;
}
export async function loadWorkspace(user, client = database) {
  // The existing backend enforces visibility with the current user's JWT/RLS.
  const [member, memberships] = await Promise.all([
    client.from('team_members').select('id,name,email,role,active').eq('id', user.id).maybeSingle().then(checked),
    client.from('company_team_members').select('company_id,auth_user_id,is_owner,roles').eq('auth_user_id', user.id).then(checked),
  ]);
  const companies = [];
  for (let offset = 0; ; offset += 500) {
    const rows = checked(await client.from('companies').select('id,name,slug,email,owner_user_id,archived')
      .order('name').order('id').range(offset, offset + 499)) || [];
    companies.push(...rows);
    if (rows.length < 500) break;
  }
  const activeCompanies = companies.filter(row => !row.archived);
  // Archiving hides a workspace; it does not remove its library or change RLS.
  // Keep active workspaces first so a default visit still opens an active one.
  const visibleCompanies = isPlatformAdmin(member)
    ? [...activeCompanies, ...companies.filter(row => row.archived)]
    : activeCompanies;
  return { member, memberships: memberships || [], companies: visibleCompanies };
}
export async function loadUniverse(companyId, client = database) {
  const [voice, profile, documents] = await Promise.all([
    client.from('company_voice_profile').select('*').eq('company_id', companyId).maybeSingle().then(checked),
    client.from('brand_profile_data').select('campo,valor,no_lo_se,origen,updated_at').eq('company_id', companyId).then(checked),
    client.from('company_expertise_documents').select('id,title,content,raw_content,extracted_summary,category,source_type,created_at,updated_at').eq('company_id', companyId).order('created_at', { ascending: false }).then(checked),
  ]);
  return { voice, profile: profile || [], documents: documents || [] };
}
export async function saveVoice(companyId, snapshot, patch, client = database) {
  const allowed = ['niche', 'products', 'patterns', 'phrases', 'never_say', 'tone_notes', 'brand_context'];
  const values = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
  if (!companyId || !Object.keys(values).length) throw new Error('No hay cambios para guardar.');
  let query;
  if (snapshot?.id) {
    query = client.from('company_voice_profile').update({ ...values, updated_at: new Date().toISOString() })
      .eq('company_id', companyId).eq('id', snapshot.id);
    query = snapshot.updated_at ? query.eq('updated_at', snapshot.updated_at) : query.is('updated_at', null);
  } else {
    query = client.from('company_voice_profile').insert({ ...values, company_id: companyId });
  }
  const result = await query.select().maybeSingle();
  if (result.error?.code === '23505' || (!result.error && !result.data)) {
    throw new Error('Otra persona actualizó esta información. Cierra la edición y actualiza el perfil antes de guardar.');
  }
  return checked(result);
}

function documentVersion(query, snapshot) {
  if (!snapshot.updated_at) throw new Error('Actualiza la marca antes de editar este documento.');
  return query.eq('updated_at', snapshot.updated_at);
}
export async function saveBrandDocument(companyId, snapshot, { title, content }, client = database) {
  if (!companyId || !title?.trim() || !content?.trim()) throw new Error('Completa el título y el contenido del documento.');
  if (title.length > 240 || content.length > 200000) throw new Error('El documento supera el tamaño permitido.');
  const values = { title: title.trim(), content: content.trim(), raw_content: content.trim(), extracted_summary: null };
  const query = snapshot?.id
    ? documentVersion(client.from('company_expertise_documents').update(values).eq('company_id', companyId).eq('id', snapshot.id), snapshot)
    : client.from('company_expertise_documents').insert({ ...values, company_id: companyId, source_type: 'text', category: 'general' });
  const result = await query.select().maybeSingle();
  if (!result.error && !result.data) throw new Error('El documento cambió. Actualiza la marca antes de volver a editarlo.');
  return checked(result);
}
export async function deleteBrandDocument(companyId, snapshot, client = database) {
  if (!companyId || !snapshot?.id) throw new Error('Documento no disponible.');
  const result = await documentVersion(client.from('company_expertise_documents').delete().eq('company_id', companyId).eq('id', snapshot.id), snapshot).select('id').maybeSingle();
  if (!result.error && !result.data) throw new Error('El documento cambió. Actualiza la marca antes de quitarlo.');
  return checked(result);
}

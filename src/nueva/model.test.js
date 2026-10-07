import { describe, expect, it } from 'vitest';
import { canManageBrand, isPlatformAdmin, publicUrl, safeReturnPath, selectedCompany } from './model.js';
import { isReservedTopSegment, matchZone } from '../lib/router.jsx';
describe('new frontend routing and access', () => {
  it('keeps /nueva and its deep links out of legacy company redirects', () => {
    expect(isReservedTopSegment('nueva')).toBe(true);
    expect(matchZone('/nueva/biblioteca').zone).toBe('nueva');
    expect(matchZone('/equipo/admin').zone).toBe('team');
    expect(matchZone('/cliente/peluna').zone).toBe('client');
  });
  it.each(['https://evil.test', '//evil.test', '/equipo', '/nuevamente', '/nueva/../admin', '/nueva/%2e%2e/admin', '/nueva/registro', '/nueva/login?volver=x', '/nueva\\evil.test', null])('rejects unsafe or looping return destination %s', value => {
    expect(safeReturnPath(value)).toBe('/nueva');
  });
  it('preserves the requested module and company after login', () => expect(safeReturnPath('/nueva/biblioteca?empresa=co-2')).toBe('/nueva/biblioteca?empresa=co-2'));
  it('separates global administration from company ownership and internal members', () => {
    expect(isPlatformAdmin({ role:'member', active:true })).toBe(false);
    expect(isPlatformAdmin({ roles:['owner'], is_owner:true })).toBe(false);
    expect(isPlatformAdmin({ role:'admin', active:false })).toBe(false);
    expect(isPlatformAdmin({ role:'admin', active:true })).toBe(true);
  });
  it('does not choose an unauthorized company from the URL', () => {
    const companies = [{ id:'own' }];
    expect(selectedCompany(companies, 'foreign')).toEqual({ id:'own' });
    expect(selectedCompany([], 'foreign')).toBe(null);
  });
  it('matches existing follow-management roles, without granting by unlinked email', () => {
    const company={id:'co',owner_user_id:'owner'},user={id:'u'};
    expect(canManageBrand(company,user,null,[{company_id:'co',email:'u@example.test',is_owner:true}])).toBe(false);
    expect(canManageBrand(company,user,null,[{company_id:'else',auth_user_id:'u',is_owner:true}])).toBe(false);
    expect(canManageBrand(company,user,null,[{company_id:'co',auth_user_id:'u',roles:['project_manager']}])).toBe(true);
    expect(canManageBrand(company,{id:'owner'},null)).toBe(true);
    expect(canManageBrand(company,user,{id:'u',role:'editor',active:true},[{company_id:'co',auth_user_id:'u',is_owner:true}])).toBe(false);
  });
  it('only renders usable web links', () => {
    expect(publicUrl('javascript:alert(1)')).toBe(null);
    expect(publicUrl('data:text/html,test')).toBe(null);
    expect(publicUrl('https://example.test/')).toBe('https://example.test/');
  });
});

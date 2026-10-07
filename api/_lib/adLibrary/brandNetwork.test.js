import { describe, expect, it } from 'vitest';
import { buildBrandNetwork, familyBrandIds } from './brandNetwork.js';
const a = '10000000-0000-4000-8000-000000000001', b = '20000000-0000-4000-8000-000000000002', c = '30000000-0000-4000-8000-000000000003';
const brands = [a,b,c].map((id,i) => ({ id, name: ['Bonapet','Bonapet GT','Third'][i], meta_page_id: String(12345+i) }));
const edge = (brandId,domain,extra={}) => ({ brandId,domain,adCount:1,profileLinked:false,...extra });
describe('evidence-based brand grouping', () => {
  it('keeps a single fanpage/domain pair independent but visible', () => {
    const net = buildBrandNetwork(brands,[edge(a,'bonapet.shop')]);
    expect(net.families).toEqual([]); expect(net.domains[0].fanpages).toHaveLength(1);
  });
  it('never merges names, TLD variants, or unrelated subdomains', () => {
    const net=buildBrandNetwork(brands,[edge(a,'bonapet.shop'),edge(b,'bonapet.net'),edge(c,'guatemala.bonapet.net')]);
    expect(net.families).toEqual([]);
  });
  it('groups two verified pages using the same exact domain', () => {
    const net=buildBrandNetwork(brands,[edge(a,'shop.example'),edge(b,'shop.example')]);
    expect(net.families).toEqual([{ id:a,name:'Bonapet',brandIds:[a,b],domains:['shop.example'] }]);
  });
  it('groups multiple domains reached by one page, including a verified profile website', () => {
    const net=buildBrandNetwork(brands,[edge(a,'bonapet.shop'),edge(a,'bonapet.net',{adCount:0,profileLinked:true})]);
    expect(net.families[0]).toMatchObject({brandIds:[a],domains:['bonapet.net','bonapet.shop']});
  });
  it('connects a chain only when each edge has evidence', () => {
    const net=buildBrandNetwork(brands,[edge(a,'one.example'),edge(a,'two.example'),edge(b,'two.example'),edge(b,'three.example'),edge(c,'three.example')]);
    expect(net.families[0].brandIds).toEqual([a,b,c]);
  });
  it('shows shared platforms but never lets them bridge brands', () => {
    const net=buildBrandNetwork(brands,[edge(a,'bonapet.shop'),edge(a,'wa.me'),edge(b,'bonapet.net'),edge(b,'wa.me'),edge(c,'docs.google.com')]);
    expect(net.families).toEqual([]); expect(net.domains.find(d=>d.domain==='wa.me').shared).toBe(true);
  });
  it('ignores unfollowed pages even if injected into the network response', () => {
    const net=buildBrandNetwork(brands.slice(0,1),[edge(a,'shop.example'),edge(b,'shop.example')]);
    expect(net.families).toEqual([]); expect(JSON.stringify(net)).not.toContain(b);
  });
  it('requires actual ads or a published profile link, not an input URL', () => {
    expect(buildBrandNetwork(brands,[edge(a,'shop.example',{adCount:0}),edge(b,'shop.example',{adCount:0})]).domains).toEqual([]);
  });
  it('suspends automatic groups when the evidence response is truncated', () => {
    expect(buildBrandNetwork(brands,[edge(a,'shop.example'),edge(b,'shop.example')],{truncated:true})).toMatchObject({families:[],truncated:true});
  });
  it('keeps IDs stable across query order and accepts any still-followed group member as anchor', () => {
    const evidence=[edge(a,'shop.example'),edge(b,'shop.example')];
    const left=buildBrandNetwork(brands,evidence),right=buildBrandNetwork([...brands].reverse(),[...evidence].reverse());
    expect(left.families).toEqual(right.families); expect(familyBrandIds(left,b)).toEqual([a,b]);
    expect(()=>familyBrandIds(left,c)).toThrow(/no está disponible/);
    expect(()=>familyBrandIds(left,'not-an-id')).toThrow(/inválida/);
  });
});

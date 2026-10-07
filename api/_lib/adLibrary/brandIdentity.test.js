import {describe,it,expect} from 'vitest';
import {parseBrandInput,websiteFanpages,jsonScripts,identityCandidates} from './brandIdentity.js';

describe('brand URL identity',()=>{
 it('accepts website, fanpage, library page and individual ad without confusing their IDs',()=>{
  expect(parseBrandInput('brand.example/products')).toMatchObject({kind:'website',url:'https://brand.example/products'});
  expect(parseBrandInput('https://m.facebook.com/Brand/?ref=share')).toMatchObject({kind:'fanpage',url:'https://www.facebook.com/Brand/'});
  expect(parseBrandInput('https://www.facebook.com/profile.php?id=123456')).toMatchObject({kind:'fanpage',pageId:'123456'});
  expect(parseBrandInput('https://facebook.com/ads/library/?view_all_page_id=123456')).toMatchObject({kind:'library',pageId:'123456'});
  expect(parseBrandInput('https://facebook.com/ads/library/?id=987654')).toMatchObject({kind:'library',adId:'987654'});
 });
 it('rejects unsafe destinations and social content that is not a page',()=>{
  for(const value of ['https://127.0.0.1','https://a:secret@public.example/','https://host.local','https://facebook.com/groups/123456','https://facebook.com/ads/library/?q=brand','https://facebook.com/profile.php'])expect(()=>parseBrandInput(value)).toThrow();
 });
 it('extracts only explicit unique fanpage links from the website',()=>{
  expect(websiteFanpages('<a href="https://facebook.com/Brand/?ref=x&amp;t=2">FB</a><a href="https://www.facebook.com/Brand/">FB</a><a href="https://facebook.com/sharer/sharer.php?u=x">share</a>', 'https://brand.example')).toHaveLength(1);
 });
 it('requires matching source identity and ignores unrelated pages',()=>{
  const payload=[{__typename:'Page',id:'123456',name:'Canonical Brand',url:'https://www.facebook.com/Brand/'},{__typename:'Page',id:'999999',name:'Suggested',url:'https://www.facebook.com/Other/'},{__typename:'User',id:'123456',name:'Person'}];
  expect(identityCandidates(payload,parseBrandInput('https://facebook.com/Brand/')).map(v=>v.name)).toEqual(['Canonical Brand']);
  expect(identityCandidates(payload,parseBrandInput('https://facebook.com/Unknown/'))).toEqual([]);
 });
 it('resolves individual ad to its fanpage rather than treating ad ID as page ID',()=>{
  const payload=[{ad_archive_id:'987654',page_id:'123456',snapshot:{page_name:'Source name'}},{ad_archive_id:'111111',page_id:'999999',snapshot:{page_name:'Other'}}];
  expect(identityCandidates(payload,parseBrandInput('https://facebook.com/ads/library/?id=987654'))).toMatchObject([{pageId:'123456',name:'Source name'}]);
 });
 it('reads JSON script data without executing embedded code',()=>{
  expect(jsonScripts('<script>throw new Error()</script><script type="application/json">{"pageID":"123456","pageName":"Brand"}</script>')).toEqual([{pageID:'123456',pageName:'Brand'}]);
 });
 it('keeps explicit safe website fields only on the matched Page',()=>{
  const payload=[{__typename:'Page',id:'123456',name:'Brand',url:'https://facebook.com/Brand',website:'https://shop.example/?utm_source=x',websites:['https://other.example','https://localhost/'],caption:'https://guessed.example'},
   {__typename:'Page',id:'999999',name:'Other',website:'https://wrong.example'},
   {pageID:'123456',pageName:'Brand',website:'https://unverified.example'}];
  expect(identityCandidates(payload,parseBrandInput('123456'))[0].websites).toEqual(['https://shop.example/','https://other.example/']);
 });
});

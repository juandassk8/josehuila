import { isSafeExternalUrl } from '../safeUrl.js';

const pageId = value => /^\d{5,25}$/.test(String(value || '')) ? String(value) : null;
const facebook = url => /(^|\.)facebook\.com$/i.test(url.hostname);
const cleanName = name => typeof name === 'string' ? name.trim().slice(0,160) : '';
export function parseBrandInput(value) {
  const raw=String(value || '').trim();
  if(pageId(raw))return {kind:'library',pageId:raw,url:`https://www.facebook.com/ads/library/?view_all_page_id=${raw}`};
  if(!raw||raw.length>2048)throw Error('BRAND_URL_INVALID');
  let url;try{url=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);}catch{throw Error('BRAND_URL_INVALID');}
  if(url.protocol==='http:')url.protocol='https:';
  if(!isSafeExternalUrl(url.href))throw Error('BRAND_URL_INVALID');
  url.hash='';
  if(!facebook(url))return {kind:'website',url:url.href};
  url.hostname='www.facebook.com';
  if(/^\/ads\/library\/?$/.test(url.pathname)){
    const id=pageId(url.searchParams.get('view_all_page_id')),adId=pageId(url.searchParams.get('id'));
    if(!id&&!adId)throw Error('BRAND_LIBRARY_PAGE_REQUIRED');
    return {kind:'library',...(id?{pageId:id}:{adId}),url:id?`https://www.facebook.com/ads/library/?view_all_page_id=${id}`:`https://www.facebook.com/ads/library/?id=${adId}`};
  }
  if(/^\/(groups|events|marketplace|watch|reel|reels|share|login|sharer)(\/|\.php|$)/i.test(url.pathname)||url.pathname==='/')throw Error('BRAND_FANPAGE_REQUIRED');
  const id=url.pathname==='/profile.php'?pageId(url.searchParams.get('id')):pageId(url.pathname.split('/').filter(Boolean).at(-1));
  url.search='';if(url.pathname==='/profile.php'){if(!id)throw Error('BRAND_FANPAGE_REQUIRED');url.searchParams.set('id',id);}
  return {kind:'fanpage',url:url.href,...(id?{pageId:id}:{})};
}

function entityDecode(value) {return value.replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#x([a-f0-9]+);|&#(\d+);/gi,(_m,h,d)=>{const n=parseInt(h||d,h?16:10);return n>0&&n<0x110000?String.fromCodePoint(n):'';});}
export function websiteFanpages(html, origin) {
  const found=new Map();
  for(const match of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)){
    try{const candidate=parseBrandInput(new URL(entityDecode(match[1]),origin).href);if(candidate.kind==='fanpage')found.set(candidate.url,candidate);}catch{/* Ignore unrelated navigation. */}
  }
  return [...found.values()].slice(0,5);
}
export function jsonScripts(html) {
  const results=[];
  for(const m of html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi))try{results.push(JSON.parse(m[1]));}catch{/* Not an identity source. */}
  return results;
}
function profileKey(raw) {
  try{const p=parseBrandInput(raw);return p.kind==='fanpage'?p.url.toLowerCase().replace(/\/$/,''):null;}catch{return null;}
}
function profileWebsites(node) {
  // Only website fields on the matched Page itself are identity evidence.
  if (node.__typename !== 'Page' && node.__isProfile !== 'Page') return [];
  const values = [node.website, node.website_url, ...(Array.isArray(node.websites) ? node.websites : [])];
  const urls = [];
  for (const value of values) {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) continue;
    try {
      const url = new URL(value);
      if (isSafeExternalUrl(url.href) && !facebook(url)) { url.search = ''; url.hash = ''; urls.push(url.href); }
    } catch { /* No inference from captions, names or nested recommendations. */ }
  }
  return [...new Set(urls)].slice(0, 20);
}
export function identityCandidates(payloads,input) {
  const result=new Map(),pending=[...payloads];let visited=0;
  while(pending.length){
    if(++visited>300000)throw Error('META_PAYLOAD_LIMIT');
    const node=pending.pop();if(!node||typeof node!=='object')continue;
    let id,name,profile;
    if(node.__typename==='Page'||node.__isProfile==='Page'){id=pageId(node.id);name=cleanName(node.name);profile=node.url;}
    else if(node.pageID&&node.pageName){id=pageId(node.pageID);name=cleanName(node.pageName);profile=node.pageURL;}
    else if(input.pageId&&node.page_id&&node.page_name){id=pageId(node.page_id);name=cleanName(node.page_name);profile=node.page_profile_uri;}
    else if(node.ad_archive_id&&node.snapshot&&(!input.adId||String(node.ad_archive_id)===input.adId)){
      id=pageId(node.page_id||node.snapshot.page_id);name=cleanName(node.page_name||node.snapshot.page_name);profile=node.snapshot.page_profile_uri;
    }
    const matches=input.pageId?id===input.pageId:input.adId?String(node.ad_archive_id)===input.adId:profileKey(profile)===profileKey(input.url)&&profileKey(input.url)!==null;
    if(id&&name&&matches){
      const websites = [...new Set([...(result.get(id)?.websites || []), ...profileWebsites(node)])].slice(0,20);
      result.set(id,{pageId:id,name,fanpageUrl:`https://www.facebook.com/profile.php?id=${id}`,libraryUrl:`https://www.facebook.com/ads/library/?view_all_page_id=${id}`,...(websites.length?{websites}:{})});
    }
    pending.push(...Object.values(node).filter(v=>v&&typeof v==='object'));
  }
  return [...result.values()].slice(0,5);
}

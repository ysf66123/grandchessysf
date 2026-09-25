const {load}=require('cheerio');
const {fetchText}=require('./wild-rift-source.cjs');
const {normalize}=require('./wild-rift-official.cjs');
const ROLES={top:'baron',baron:'baron',solo:'baron',mid:'mid',jungle:'jungle',adc:'duo',bot:'duo',sup:'support',dragon:'duo',duo:'duo',support:'support'};
function sourceDate($){
 let value=null;
 function visit(v){if(!v||typeof v!=='object')return;if(typeof v.dateModified==='string')value=v.dateModified;for(const x of Object.values(v))if(typeof x==='object')visit(x);}
 $('script[type="application/ld+json"]').each((_,e)=>{try{visit(JSON.parse($(e).text()));}catch{}});
 value ||= $('.editdate').first().text().trim();
 if(/^\d{1,2} [A-Za-z]{3} \d{4}$/.test(value||''))value+=' 00:00:00 GMT';
 return value&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
}
function parseCoreCatalog(html,data){
 const $=load(html),byName=new Map(data.champions.flatMap(c=>[[normalize(c.name),c.id],[normalize(c.id),c.id]])),urls={};
 $('a[href]').each((_,e)=>{const href=$(e).attr('href');if(!/^\/en\/champions\/[a-z0-9-]+\/$/.test(href))return;const id=byName.get(normalize($(e).find('.chub-card__name').text()))||byName.get(normalize(href.split('/')[3]));if(id)urls[id]='https://wildriftcore.com'+href;});
 if(Object.keys(urls).length<Math.min(50,data.champions.length))throw Error('Kaynak şampiyon dizini doğrulanamadı.');return urls;
}
function parseCoreCounters(html,champion,data,checkedAt=new Date().toISOString(),sourceUrl){
 const $=load(html),patch=$('.cover__issue,.cd-chip--patch').first().text().match(/Patch\s+(\d+\.\d+[a-z]?)/i)?.[1];
 if(!normalize($('h1').first().text()).startsWith(normalize(champion.name))||patch!==data.latestPatch.version)throw Error('Karşı seçim rehberi şampiyon/yama doğrulamasını geçemedi.');
 const ids=new Map(data.champions.map(c=>[c.id,c])),aliases=new Map(data.champions.flatMap(c=>[[normalize(c.id),c.id],[normalize(c.name),c.id]])),rows=[],updatedAt=sourceDate($),url=sourceUrl||'https://wildriftcore.com/en/champions/'+champion.id+'/';
 $('.wall__cell').each((_,e)=>{
  const cell=$(e),slug=cell.attr('href')?.match(/^\/en\/champions\/([a-z0-9-]+)\/$/)?.[1],opponent=aliases.get(normalize(slug||''));let role=ROLES[cell.attr('data-lane')?.toLowerCase()];
  if(!ids.has(opponent)||opponent===champion.id||!role)return;
  const type=['hard','unfav','skill','fav','syn'].find(t=>cell.hasClass('wall__cell--'+t));if(!type)return;
  const kind=type==='syn'?'synergy':type==='skill'?'skill':'counter';
  // Some synergy cards label the partner lane, not the page champion lane.
  if(kind==='synergy'&&!champion.roles.includes(role)&&champion.roles.length===1)role=champion.roles[0];
  if(!champion.roles.includes(role))return;
  if(kind!=='synergy'&&!ids.get(opponent).roles.includes(role))return;
  rows.push({subject:type==='fav'?opponent:champion.id,opponent:type==='fav'?champion.id:opponent,role,kind,strength:type==='hard'?'hard':type==='unfav'||type==='fav'?'moderate':'unspecified',source:'wildriftcore',family:'wildriftcore',basis:'guide',game:'wild-rift',patch,checkedAt,updatedAt,url});
 });
 if(!rows.length)throw Error('Karşı seçim kartı bulunamadı.');
 return rows;
}
async function collectCounterSources(data,{previous=data.counterSources,fetchPage=fetchText,limit=data.champions.length,delay=1500,onProgress=()=>{},urls=null}={}){
 const checkedAt=new Date().toISOString(),old=data.evidence?.relationships||[],rows=old.filter(r=>r.source!=='wildriftcore'),pages={...(previous?.pages||{})};
 const ordered=[...data.champions].sort((a,b)=>{
  const age=c=>Math.max(Date.parse(pages[c.id]?.checkedAt)||0,Date.parse(pages[c.id]?.lastAttemptAt)||0);
  const popularity=c=>Math.max(0,...Object.values(data.stats.brackets).flat().filter(r=>r.id===c.id).map(r=>r.pick||0));
  return age(a)-age(b)||popularity(b)-popularity(a);
 });
 // Schema 1 wrongly treated three parser failures as a server-wide rate limit.
 const legacyParserPause=previous?.schema===1&&Object.values(previous.pages||{}).filter(p=>p.status==='unavailable').every(p=>!p.reason);
 let fetched=0,blocked=!legacyParserPause&&Date.parse(previous?.retryAfter)>Date.now(),failures=0;
 if(!blocked&&!urls)try{urls=parseCoreCatalog(await fetchPage('https://wildriftcore.com/en/champions/'),data);}catch(e){blocked=true;}
 urls ||= previous?.urls||{};
 for(const c of ordered){
  const saved=old.filter(r=>r.source==='wildriftcore'&&(r.owner||r.subject)===c.id),page=pages[c.id];
  if(blocked||fetched>=limit||(page?.parserVersion===2&&page?.patch===data.latestPatch.version&&Date.now()-Date.parse(page.checkedAt)<6*3600000)){rows.push(...saved);continue;}
  if(!urls[c.id]){rows.push(...saved);pages[c.id]={...page,status:'unavailable',lastAttemptAt:checkedAt,reason:'Kaynağın şampiyon dizininde adres bulunamadı.'};continue;}
  fetched++;
  try{const html=await fetchPage(urls[c.id]);failures=0;const parsed=parseCoreCounters(html,c,data,checkedAt,urls[c.id]).map(r=>({...r,owner:c.id}));rows.push(...parsed);pages[c.id]={patch:data.latestPatch.version,checkedAt,status:'available',count:parsed.length,parserVersion:2,url:urls[c.id]};}
  catch(e){rows.push(...saved);pages[c.id]={...page,status:'unavailable',lastAttemptAt:checkedAt,reason:/429|403/.test(e.message)?'Kaynak erişimi sınırladı.':'Yanıt veya eşleşme kartları doğrulanamadı.'};if(/Kaynak yanıtı|bağlanılamadı|HTTP/.test(e.message))failures++;if(/429|403/.test(e.message)||failures>=3)blocked=true;}
  onProgress(fetched,Math.min(limit,ordered.length));if(delay)await new Promise(r=>setTimeout(r,delay));
 }
 data.evidence||={relationships:[]};data.evidence.relationships=rows;
 data.counterSources={schema:2,urls,checkedAt,patch:data.latestPatch.version,pages,fetched,count:rows.filter(r=>r.source==='wildriftcore').length,...(blocked?{retryAfter:previous?.retryAfter&&Date.parse(previous.retryAfter)>Date.now()?previous.retryAfter:new Date(Date.now()+3600000).toISOString()}:{})};
 return data.counterSources;
}
// Reparse already fetched public pages without pretending a new download occurred.
async function reparseCachedMeta(data){
 const fs=require('node:fs/promises'),path=require('node:path'),{hash}=require('./wild-rift-source.cjs'),{parseMetaGuide}=require('./wild-rift-providers.cjs');
 const old=data.evidence?.relationships||[],replacement=new Map();
 for(const c of data.champions){
  const saved=old.filter(r=>r.source==='wrmeta'&&r.subject===c.id),record=saved[0];if(!record?.url||!record.checkedAt)continue;
  try{const cache=JSON.parse(await fs.readFile(path.join(process.env.WR_CACHE_DIR||path.join(__dirname,'../.wr-source-cache'),hash(record.url)+'.json'),'utf8'));
   if(cache.url!==record.url)continue;const parsed=parseMetaGuide(cache.text,c,data,record.checkedAt,record.url);
   if(parsed.length&&parsed.every(r=>r.patch===record.patch))replacement.set(c.id,parsed);
  }catch{/* No cache or changed markup: keep the dated observations. */}
 }
 data.evidence.relationships=[...old.filter(r=>r.source!=='wrmeta'||!replacement.has(r.subject)),...[...replacement.values()].flat()];
 return replacement.size;
}
module.exports={parseCoreCatalog,parseCoreCounters,collectCounterSources,sourceDate,reparseCachedMeta};

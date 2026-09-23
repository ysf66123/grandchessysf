const {load}=require('cheerio');
const {fetchText}=require('./wild-rift-source.cjs');
const {resolver,normalize,parseOfficialItems,applyOfficial}=require('./wild-rift-official.cjs');
const ROLE={TOP:'baron',Solo:'baron',Baron:'baron',JUNGLE:'jungle',Jungle:'jungle',MID:'mid',Mid:'mid',DRAGON:'duo',Duo:'duo',Dragon:'duo',SUPPORT:'support',Support:'support'};
const SOURCES=[
 {id:'riot',name:'Riot Games',url:'https://wildrift.leagueoflegends.com/tr-tr/news/tags/patch-notes/',kind:'official'},
 {id:'wildriftfire',name:'WildRiftFire',url:'https://www.wildriftfire.com',kind:'guide'},
 {id:'wildriftcore',name:'WildRiftCore',url:'https://wildriftcore.com/en/',kind:'guide'},
 {id:'wrmeta',name:'WR-META',url:'https://wr-meta.com/',kind:'guide'},
 {id:'riftgg',name:'RiftGG',url:'https://www.riftgg.app/en',kind:'statistics',population:'tencent-cn'},
 {id:'riftforge',name:'RiftForge',url:'https://rift-forge.com/',kind:'guide'},
 {id:'lolegacy',name:'LoLegacy',url:'https://play.google.com/store/apps/details?id=com.wuochoang.lolegacy',kind:'app'}
];
function championResolver(data){const map=new Map(data.champions.flatMap(c=>[[normalize(c.id),c.id],[normalize(c.name),c.id]]));return value=>map.get(normalize(value));}
// Decode public server-rendered JSON only. Never evaluate third-party JavaScript.
function flightObjects(html){
 const $=load(html);let payload='';
 $('script').each((_,e)=>{const t=$(e).text();if(!t.startsWith('self.__next_f.push('))return;try{const value=JSON.parse(t.slice(19,-1));if(typeof value[1]==='string')payload+=value[1];}catch{}});
 const objects=[];for(const line of payload.split('\n')){try{const object=JSON.parse(line.slice(line.indexOf(':')+1));if(object&&typeof object==='object')objects.push(object);}catch{}}
 return objects;
}
function visit(value,fn){if(!value||typeof value!=='object')return;fn(value);for(const child of Object.values(value))if(child&&typeof child==='object')visit(child,fn);}
function parseCore(html,roster,live,data,checkedAt){
 const $=load(html),resolve=resolver(data.items),resolveChampion=championResolver(data),observations=[],champions=[],statistics=[];
 const patch=$('body').text().match(/Patch spotlight\s+(\d+\.\d+[a-z]?)/i)?.[1]||null;
 $('.items-card').each((_,e)=>{try{const t=JSON.parse($(e).attr('data-item-tooltip')||$(e).find('[data-item-tooltip]').first().attr('data-item-tooltip'));const id=resolve(t.title);if(!Number.isFinite(t.cost)||t.cost<0||t.cost>10000)return;observations.push({id,name:t.title,cost:t.cost,source:'wildriftcore',patch,checkedAt,url:new URL($(e).find('a[href]').attr('href'),'https://wildriftcore.com').href});}catch{}});
 if(observations.length<50)throw Error('WildRiftCore eşya kataloğu doğrulanamadı.');
 for(const c of roster||[]){const id=resolveChampion(c.slug)||resolveChampion(c.name);const roles=Array.isArray(c.roles)?c.roles:Object.values(c.roles||{}).flat();if(id)champions.push({id,roles:[...new Set(roles.map(r=>ROLE[r]).filter(Boolean))],tiers:c.tl||{}});}
 // This endpoint's `patch` is a calendar date, and rank is not declared.
 // Preserve it as dated reference data, never a rank-specific replacement.
 const day=String(live?.patch||'');const asOf=/^\d{8}$/.test(day)?`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6,8)}`:null;
 for(const [name,c] of Object.entries(live?.champions||{})){const id=resolveChampion(name);if(!id)continue;for(const [role,metrics] of Object.entries(c.byRole||{}))if(ROLE[role]&&[metrics.winRate,metrics.pickRate,metrics.banRate].every(n=>Number.isFinite(n)&&n>=0&&n<=100))statistics.push({id,role:ROLE[role],win:metrics.winRate,pick:metrics.pickRate,ban:metrics.banRate});}
 return {observations,champions,statistics:{asOf,region:'CN',rank:null,population:'tencent-cn',rows:statistics},patch};
}
function parseMetaItems(html,data,checkedAt){
 const $=load(html),resolve=resolver(data.items),observations=[];
 $('.iname').each((_,e)=>{const name=$(e).text().trim(),scope=$(e).parent(),raw=scope.find('.goldt').first().text().trim();if(!/^\d{2,5}$/.test(raw))return;const cost=Number(raw);if(cost>10000)return;observations.push({id:resolve(name),name,cost,source:'wrmeta',patch:null,checkedAt,url:'https://wr-meta.com/items/'});});
 if(observations.length<50)throw Error('WR-META eşya kataloğu doğrulanamadı.');return observations;
}
function parseMetaGuide(html,champion,data,checkedAt,url){
 const $=load(html),resolve=championResolver(data),patch=$('h1').first().text().match(/\((\d+\.\d+[a-z]?)\)/)?.[1];
 if(!patch)throw Error('WR-META rehber yaması doğrulanamadı.');const relationships=[];
 $('.tabs-b4').each((_,section)=>{
   const heading=$(section).find('h2').first().text().trim(),role=ROLE[heading.split(/\s+/)[0]];if(!role||!heading.includes('Counters'))return;
   $(section).find('.tabs-box2').each((_,box)=>{
     const title=$(box).find('h3').first().text().trim(),kind=title==='Threats'?'counter':title==='Synergies'?'synergy':null;if(!kind)return;
     // Only publicly visible cards; locked content is never requested or inferred.
     $(box).find('.counter-champion').each((_,card)=>{if($(card).closest('.lock-block').length)return;const opponent=resolve($(card).find('.top-title').text().trim());if(opponent&&opponent!==champion.id)relationships.push({subject:champion.id,opponent,role,kind,source:'wrmeta',patch,checkedAt,url});});
   });
 });
 return relationships;
}
function parseForge(html,data,checkedAt){
 const $=load(html),patch=$('body').text().match(/Live patch\s*·\s*(\d+\.\d+[a-z]?)/)?.[1]||null,resolve=resolver(data.items),rows=new Map();
 for(const obj of flightObjects(html))visit(obj,v=>{const i=v.item;if(!i||typeof i.name!=='string'||!Number.isFinite(i.cost)||i.cost<100||i.cost>10000)return;const id=resolve(i.name);rows.set(id,{id,name:i.name,cost:i.cost,source:'riftforge',patch,checkedAt,url:'https://rift-forge.com/items'});});
 if(rows.size<40)throw Error('RiftForge herkese açık eşya verisi doğrulanamadı.');return {observations:[...rows.values()],patch};
}
function parseRiftGG(html,champion,data,checkedAt,url){
 const resolve=championResolver(data),rows=[];let found=false;
 for(const obj of flightObjects(html))visit(obj,v=>{if(!Array.isArray(v.stats?.matchups))return;found=true;
   for(const entry of v.stats.matchups)for(const row of entry.counters||[]){const opponent=resolve(row.heroSlug),win=row.metrics?.winRate;if(!opponent||!Number.isFinite(win)||win<0||win>1||!Number.isFinite(Date.parse(entry.dataDate)))continue;
     rows.push({subject:champion.id,opponent,win:win*100,source:'riftgg',asOf:entry.dataDate,rankLevel:entry.rankLevel,laneCode:String(entry.lane),region:'CN',population:'tencent-cn',patch:null,sampleSize:null,checkedAt,url});}
 });
 if(!found)throw Error('RiftGG eşleşme verisi bulunamadı.');return rows;
}
async function collectEvidence(data,{previous=null,onProgress=()=>{},guideLimit=Infinity}={}){
 const checkedAt=new Date().toISOString(),result={schema:1,checkedAt,providers:SOURCES.map(s=>({...s,status:'pending'})),items:[],relationships:[],matchups:[],champions:[],statistics:[]};
 const provider=id=>result.providers.find(p=>p.id===id);
 for(const i of Object.values(data.items))if(i.costSource?.includes('wildriftfire.com')&&Number.isFinite(i.cost))result.items.push({id:i.id,name:i.name,cost:i.cost,source:'wildriftfire',patch:i.costPatch,checkedAt:i.costCheckedAt,url:i.costSource});
 const run=async(id,task)=>{try{await task();Object.assign(provider(id),{status:'available',checkedAt});}catch(e){Object.assign(provider(id),{status:'unavailable',checkedAt,message:e.message});}};
 Object.assign(provider('wildriftfire'),{status:'available',checkedAt:data.checkedAt,patch:data.latestPatch.version,champions:data.champions.length});
 Object.assign(provider('lolegacy'),{status:'manual',message:'Mobil uygulama; doğrulanmış açık veri arayüzü bulunmadı. Otomatik veri kaynağı olarak kullanılmıyor.'});
 const officialUrl=`https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-${data.latestPatch.version.replace('.','-')}/`;
 await run('riot',async()=>{const official=parseOfficialItems(await fetchText(officialUrl),data.items,data.latestPatch.version,officialUrl,checkedAt);applyOfficial(data,official);Object.assign(provider('riot'),{patch:official.patch,items:Object.keys(official.items).length,recipes:Object.values(official.items).filter(i=>i.recipe).length});});
 await Promise.all([
  run('wildriftcore',async()=>{const [html,roster,live]=await Promise.all([fetchText('https://wildriftcore.com/en/items/'),fetchText('https://wildriftcore.com/assets/data/draft-roster.json').then(JSON.parse),fetchText('https://wildriftcore.com/assets/data/live-meta.json').then(JSON.parse)]);const r=parseCore(html,roster,live,data,checkedAt);result.items.push(...r.observations);result.champions.push(...r.champions.map(c=>({...c,source:'wildriftcore'})));result.statistics.push({...r.statistics,source:'wildriftcore'});Object.assign(provider('wildriftcore'),{patch:r.patch,items:r.observations.length,champions:r.champions.length,asOf:r.statistics.asOf});}),
  run('riftforge',async()=>{const r=parseForge(await fetchText('https://rift-forge.com/items'),data,checkedAt);result.items.push(...r.observations);Object.assign(provider('riftforge'),{patch:r.patch,items:r.observations.length,message:'Herkese açık eşya kataloğu; kişisel yapay zekâ analiz servisi kullanılmıyor.'});})
 ]);
 let metaCatalog=[];
 await run('wrmeta',async()=>{const [html,home]=await Promise.all([fetchText('https://wr-meta.com/items/'),fetchText('https://wr-meta.com/')]);const observations=parseMetaItems(html,data,checkedAt);result.items.push(...observations);const $=load(home),resolve=championResolver(data),seen=new Set();$('a[href]').each((_,e)=>{const href=$(e).attr('href'),id=resolve($(e).text().trim());if(id&&!seen.has(id)&&/^https:\/\/wr-meta\.com\/\d+-[a-z0-9-]+\.html$/.test(href)){seen.add(id);metaCatalog.push({id,url:href});}});Object.assign(provider('wrmeta'),{items:observations.length,message:'Ücretsiz görünen eşleşme kartları kullanılır; kilitli içerik alınmaz. Eşya sayfasında yama etiketi yok.'});});
 const tasks=data.champions.slice(0,guideLimit),failures={wrmeta:[],riftgg:[]};let cursor=0,completed=0;
 async function worker(){while(cursor<tasks.length){const c=tasks[cursor++],meta=metaCatalog.find(x=>x.id===c.id);
   if(meta)try{result.relationships.push(...parseMetaGuide(await fetchText(meta.url),c,data,checkedAt,meta.url));}catch{failures.wrmeta.push(c.id);}
   const url=`https://www.riftgg.app/en/champions/${c.id}/cn-stats`;
   try{result.matchups.push(...parseRiftGG(await fetchText(url),c,data,checkedAt,url));}catch{failures.riftgg.push(c.id);}
   onProgress(++completed,tasks.length,c.id);await new Promise(r=>setTimeout(r,200));
 }}
 await Promise.all([worker(),worker()]);
 if(provider('wrmeta').status==='available')Object.assign(provider('wrmeta'),{relationships:result.relationships.length,failures:failures.wrmeta,status:failures.wrmeta.length?'partial':'available'});
 Object.assign(provider('riftgg'),{status:result.matchups.length?'available':'unavailable',checkedAt,rows:result.matchups.length,failures:failures.riftgg,asOf:result.matchups.map(r=>r.asOf).sort().at(-1)||null,message:'Çin sunucusu; tarih/yama/lig kapsamı doğrulanmadan puanlamaya katılmaz.'});
 // Keep prior observations with their ORIGINAL timestamps if a provider fails.
 for(const p of result.providers)if(p.status==='unavailable'&&previous){for(const field of ['items','relationships','matchups','statistics'])result[field].push(...(previous[field]||[]).filter(r=>r.source===p.id));}
 // Historical records cannot affect ranking. Ship a bounded example per champion
 // rather than transferring every obsolete rank/role row to mobile clients.
 const selected=new Map();result.matchups=result.matchups.filter(row=>{if(Date.now()-Date.parse(row.asOf)<7*86400000)return true;const key=row.subject+':'+row.rankLevel;const n=selected.get(key)||0;selected.set(key,n+1);return n<3;});
 data.evidence=result;return result;
}
module.exports={SOURCES,flightObjects,parseCore,parseMetaItems,parseMetaGuide,parseForge,parseRiftGG,collectEvidence};

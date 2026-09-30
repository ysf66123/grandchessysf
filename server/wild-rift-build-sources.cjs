const {load}=require('cheerio');
const {fetchText,parseEffectText}=require('./wild-rift-source.cjs');
const {resolver,normalize}=require('./wild-rift-official.cjs');
const {normalizePatch}=require('./wild-rift-patch.cjs');
const CORE='https://wildriftcore.com';
function reviewCoreItem(fact,patch){
 if(fact.patch==='7.3'&&patch==='7.3a'&&!['yun-tal-wildarrows','whispering-circlet','diadem-of-songs','deaths-dance'].includes(fact.id))return {...fact,verifiedForPatch:'7.3a',patchReviewUrl:'https://wildrift.leagueoflegends.com/tr-tr/news/game-updates/wild-rift-patch-notes-7-3a/'};
 return fact;
}
const ROLE={'mid lane':'mid',mid:'mid',jungle:'jungle','solo lane':'baron','baron lane':'baron','top lane':'baron',top:'baron','dragon lane':'duo','duo lane':'duo',adc:'duo',support:'support'};
function parseCoreItems(html,items,checkedAt=new Date().toISOString()){
 const $=load(html),patch=normalizePatch($('body').text().match(/Patch spotlight\s+(\d+\.\d+[a-z]?)/i)?.[1]);
 if(!patch)throw Error('İkinci eşya kaynağında yama bulunamadı.');
 const resolve=resolver(items),rows=new Map(),keys={'Health':'health','Max Health':'health','Mana':'mana','Armor':'armor','Magic Resist':'magicResist','Magic Resistance':'magicResist','Attack Damage':'ad','Ability Power':'ap','Attack Speed':'attackSpeed','Critical Rate':'crit','Critical Strike Chance':'crit','Ability Haste':'haste','Lifesteal':'lifesteal'};
 $('.items-card [data-item-tooltip]').each((_,e)=>{
  try{const raw=JSON.parse($(e).attr('data-item-tooltip')),id=resolve(raw.title),url=new URL($(e).attr('href'),CORE);
   if(!/^[a-z0-9-]+$/.test(id)||url.hostname!=='wildriftcore.com'||!url.pathname.startsWith('/en/items/')||!Number.isFinite(raw.cost)||raw.cost<100||raw.cost>10000)return;
   const stats={};for(const s of raw.stats||[]){const key=keys[s.label],value=String(s.value).trim();if(key&&/^\+?\d+(?:\.\d+)?%?$/.test(value))stats[key]=Number(value.replace(/[+%]/g,''));}
   const parsed=parseEffectText([raw.lead,...(raw.passives||[]).map(p=>typeof p==='string'?p:JSON.stringify(p))].join(' '));
   rows.set(id,{id,name:raw.title,cost:raw.cost,stats,...parsed,patch,checkedAt,source:url.href});
  }catch{/* Ignore malformed cards rather than inventing an identity. */}
 });
 if(rows.size<50)throw Error('İkinci eşya kataloğu eksik.');
 return {patch,checkedAt,items:[...rows.values()]};
}
function parseCoreBuilds(html,champion,data,checkedAt=new Date().toISOString()){
 const $=load(html),section=$('.engine-builds').first(),patch=normalizePatch(section.find('h2').text().match(/patch (\d+\.\d+[a-z]?)/i)?.[1]);
 if(!normalize($('h1').text()).startsWith(normalize(champion.name)))throw Error('Ek dizilim şampiyonu doğrulanamadı.');
 const reviewed=patch==='7.3'&&data.latestPatch.version==='7.3a';
 if(patch!==data.latestPatch.version&&!reviewed)throw Error('Ek dizilim güncel yamaya ait değil.');
 const panels=section.find('.eb-rolepanel').length?section.find('.eb-rolepanel').toArray():[section[0]],rows=[];
 for(const panel of panels){const scope=$(panel);
 const summary=scope.find('p').map((_,e)=>$(e).text().trim()).get().find(t=>/^Best .+ build \(/.test(t))||'';
 const role=ROLE[summary.match(/build \(([^)]+)\)/)?.[1].toLowerCase()],primary=champion.builds.find(b=>b.role===role);
 if(!primary)continue;
 const resolve=resolver(data.items),boot=resolve(summary.match(/, boots (.*?), keystone/)?.[1]||'');
 const url=(data.counterSources?.urls?.[champion.id]||CORE+'/en/champions/'+champion.id+'/')+'builds/';
 scope.find('.engine-builds__variant').each((index,e)=>{
  const ids=$(e).find('.eb-items .eb-item').map((_,n)=>resolve($(n).find('span').text())).get(),title=$(e).find('h3,h4').text().trim();
  const final=[boot,...ids];
  if(ids.length!==5||new Set(final).size!==6||final.some(id=>!data.items[id]))return;
  const affectedChampions=['hwei','samira','rammus','malphite','tristana','draven','caitlyn','senna','syndra','swain','yuumi','viego'];
  const affectedItems=['yun-tal-wildarrows','whispering-circlet','diadem-of-songs','deaths-dance'];
  const verifiedForPatch=reviewed&&!affectedChampions.includes(champion.id)&&!final.some(id=>affectedItems.includes(id))?'7.3a':null;
  const type=$(e).attr('data-variant-key')||(/^Safety/i.test(title)?'safety':/^Anti-resist/i.test(title)?'resist':/^Standard/i.test(title)?'standard':'alternative');
  const usageConditions=[];const conditionText=$(e).find('.eb-when .eb-chip').text()+' '+$(e).find('.eb-variant-desc').text();
  if(/2\+ (?:enemy )?dive threats/i.test(conditionText))usageConditions.push({key:'dive',min:2});
  if(/2\+ (?:enemy )?burst champions/i.test(conditionText))usageConditions.push({key:'burst',min:2});
  if(/enemy tanks|builds? (?:Magic Resist|Armor)|resistance/i.test(conditionText)&&/resist|tank/i.test(type))usageConditions.push({key:'resistance',min:2});
  if(/when behind|from behind/i.test(conditionText))usageConditions.push({key:'behind'});
  rows.push({...primary,guideId:'core-'+role+'-'+index,source:url,sourceId:'wildriftcore',region:'CN',variantType:type,
   label:({standard:'Dengeli kaynak dizilimi',safety:'Savunmalı kaynak dizilimi',resist:'Dirençlere karşı kaynak dizilimi','anti-ad':'Fiziksel hasara karşı','anti-ap':'Büyü hasarına karşı','anti-tank':'Ön saflara karşı',bruiser:'Dayanıklı dövüşçü',peel:'Taşıyıcıyı koruma','anti-dive':'Dalışa karşı',sustain:'Uzun çatışma'})[type]||'Ek kaynak dizilimi',
   patch,usageConditions,provenance:{patchScope:'engine-builds-section',sourcePatch:patch,checkedAt},verifiedForPatch,patchReviewUrl:verifiedForPatch?'https://wildrift.leagueoflegends.com/tr-tr/news/game-updates/wild-rift-patch-notes-7-3a/':null,fetchedAt:checkedAt,updatedAt:require('./wild-rift-counter-sources.cjs').sourceDate($),basis:'computed-guide',sourceSlotCount:6,final,core:ids.slice(0,2),boots:[boot],situational:[],
   purchaseOrder:ids,starting:primary.starting,runeSource:primary.source,counters:[],synergies:[]});
  });
 }
 if(!rows.length)throw Error('Ek kaynakta doğrulanmış altı yuvalı dizilim yok.');
 return rows;
}
async function collectBuildSources(data,{previous,onProgress=()=>{}}={}){
 const checkedAt=new Date().toISOString(),failures=[],reasons={},old=new Map((previous?.champions||[]).map(c=>[c.id,(c.sourceBuilds||[]).filter(b=>b.sourceId==='wildriftcore')]));
 let cursor=0,completed=0,consecutiveFailures=0,rateLimited=false;
 async function worker(){while(cursor<data.champions.length){const c=data.champions[cursor++];
   try{
    const saved=old.get(c.id)||[];
    if(previous?.buildSources?.parserVersion===3&&previous.buildSources.patch===data.latestPatch.version&&saved.length&&saved.every(b=>Date.now()-Date.parse(b.fetchedAt)<6*3600000)){c.sourceBuilds=[...(c.sourceBuilds||[]).filter(b=>b.sourceId!=='wildriftcore'),...saved];onProgress(++completed,data.champions.length);continue;}
    if(rateLimited||consecutiveFailures>=8||Date.parse(previous?.buildSources?.retryAfter)>Date.now())throw Error('Kaynak bekleme süresinde; önceki doğrulanmış kayıt korundu.');
    const canonical=data.counterSources?.urls?.[c.id];
    if(!canonical)throw Error('Kaynağın şampiyon dizininde adres bulunamadı.');
    let html;try{html=await fetchText(canonical+'builds/');consecutiveFailures=0;}catch(e){consecutiveFailures++;throw e;}
    c.sourceBuilds=[...(c.sourceBuilds||[]).filter(b=>b.sourceId!=='wildriftcore'),...parseCoreBuilds(html,c,data,checkedAt)];
   }catch(e){if(/429/.test(e.message))rateLimited=true;c.sourceBuilds=[...(c.sourceBuilds||[]).filter(b=>b.sourceId!=='wildriftcore'),...(old.get(c.id)||[])];failures.push(c.id);reasons[c.id]=e.message;}
   onProgress(++completed,data.champions.length);await new Promise(r=>setTimeout(r,650));
 }}
 await worker();
 data.buildSources={parserVersion:3,checkedAt,patch:data.latestPatch.version,source:'wildriftcore',region:'CN',count:data.champions.reduce((n,c)=>n+(c.sourceBuilds||[]).filter(b=>b.sourceId==='wildriftcore').length,0),failures,reasons,...(rateLimited?{retryAfter:new Date(Date.now()+3600000).toISOString()}:Date.parse(previous?.buildSources?.retryAfter)>Date.now()?{retryAfter:previous.buildSources.retryAfter}:{})};
 return data.buildSources;
}
module.exports={parseCoreItems,parseCoreBuilds,collectBuildSources,reviewCoreItem};

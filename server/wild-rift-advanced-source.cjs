const {load}=require('cheerio'),{hash,comparePatch}=require('./wild-rift-source.cjs'),{resolver,normalize,parseOfficialItems}=require('./wild-rift-official.cjs');
const PATCHES=['7.2','7.2a','7.2b','7.2c','7.2d','7.2e','7.3','7.3a'];
const urlFor=p=>'https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-'+(p==='7.2e'?'72e':p.replace('.','-'))+'/';
function clean(html){const $=load(html);$('script,style,nav,footer').remove();return {$,text:$('body').text().normalize('NFKC').replace(/\s+/g,' ')};}
function parseAttackRules(html,data,checkedAt){
 const {$,text}=clean(html);if(!/Patch Notes 7\.3\b/.test($('h1').text())||!text.includes('Attack Speed Ratio:'))throw Error('Resmî saldırı hızı tablosu eksik.');
 if(!/0\.7\s*\+\s*0\.04/.test(text))throw Error('Seviyeye bağlı saldırı hızı büyümesi doğrulanamadı.');
 const rows={},conflicts={};
 for(const c of data.champions){
  const name=c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/[’']/g,"[’']");
  const pattern='Base Stats:?\\s*Attack Speed Ratio:\\s*(\\d*\\.?\\d+)\\s*Base Attack Speed:\\s*(\\d*\\.?\\d+)\\s*Base Bonus Attack Speed:\\s*(\\d*\\.?\\d+)\\s*Attack Speed per Level:\\s*(\\d*\\.?\\d+)';
  const matches=[...text.matchAll(new RegExp(name+'\\s*'+pattern,'gi'))];
  // Main champion sections can have introductory prose before the stats.
  // Compare their explicit identity with appendix values instead of silently
  // selecting one contradictory number from the same official document.
  $('[data-testid="character-name"]').filter((_,e)=>normalize($(e).text())===normalize(c.name)).each((_,e)=>{
   const main=$(e).parent().text().normalize('NFKC').replace(/\s+/g,' '),m=main.match(new RegExp(pattern,'i'));if(m)matches.push(m);
  });
  const m=matches.at(-1);if(!m)continue;const values=m.slice(1).map(Number),variants=[...new Map(matches.map(m=>{const v=m.slice(1).map(Number);return [v.join('|'),v];})).values()];
  if(variants.length>1)conflicts[c.id]=variants;
  if(values.every(n=>n>=0&&n<=2)&&values[0]>0&&values[1]>0)rows[c.id]={ratio:values[0],base:values[1],baseBonus:values[2],growth:values[3]};
 }
 if(Object.keys(rows).length<100)throw Error('Resmî saldırı hızı kapsamı beklenenden düşük.');
 return {patch:data.latestPatch.version,basePatch:'7.3',checkedAt,source:urlFor('7.3'),baseCriticalMultiplier:2,cap:3,levelGrowth:{constant:.7,increment:.04},conflicts,byChampion:rows,contentHash:hash(JSON.stringify({rows,conflicts}))};
}
function parseRange(html,champion,patch,url,checkedAt){
 const {$}=clean(html),title=$('h1').first().text().trim(),sourcePatch=$('.cover__issue').text().match(/Patch\s*(\d+\.\d+[a-z]?)/i)?.[1];
 const identity=normalize(title),name=normalize(champion.name);
 if(!(identity===name||identity.startsWith(name+'wildrift'))||sourcePatch!==patch)throw Error('Menzil kimliği veya yaması uyuşmuyor.');
 const chip=$('.statslab__chip').filter((_,e)=>/^Attack range\s*\d+$/i.test($(e).text().trim())).first().text(),value=Number(chip.match(/\d+/)?.[0]);
 if(!Number.isInteger(value)||value<100||value>900)throw Error('Temel saldırı menzili doğrulanamadı.');
 return {value,patch,checkedAt,source:url,scope:'base-attack-range',variable:champion.combatFacts?.mechanics.rangeMode==='variable'};
}
async function collectAdvancedEvidence(data,fetchPage,{delay=1500,onProgress=()=>{}}={}){
 const checkedAt=new Date().toISOString(),pages=[];
 for(const p of PATCHES.slice(0,PATCHES.indexOf(data.latestPatch.version)+1)){const url=urlFor(p);pages.push({patch:p,url,html:await fetchPage(url)});}
 if(!pages.length)return {unsupported:true};
 try{const rules=parseAttackRules(pages.find(p=>p.patch==='7.3').html,data,checkedAt);rules.reviewedSources=pages.filter(p=>comparePatch(p.patch,'7.3')>=0).map(p=>p.url);data.attackRules=rules;}catch(e){data.advancedEvidence={...(data.advancedEvidence||{}),attackFailure:e.message};}
 // Fill recipe gaps from the complete official chain; never overwrite an
 // already current recipe with an older section or forward an unknown patch.
 const merged=new Map();for(const page of pages){const parsed=parseOfficialItems(page.html,data.items,page.patch,page.url,checkedAt,{allowSparse:true});for(const f of Object.values(parsed.items)){
  const old=merged.get(f.id)||{},next={...old,...f,stats:{...old.stats,...f.stats}};
  if(!f.recipe&&old.recipe&&f.cost&&old.cost)next.recipe={...old.recipe,fee:old.recipe.fee+f.cost-old.cost};merged.set(f.id,next);
 }}
 let addedRecipes=0;for(const [id,f] of merged){const item=data.items[id];if(!item||item.removedIn&&comparePatch(item.removedIn,data.latestPatch.version)<=0)continue;
  // A reviewed official price supersedes an inconsistent community tooltip.
  // Keep the original base patch plus every intervening document as proof.
  if(f.cost&&item.official?.patch!==data.latestPatch.version){item.official={id,name:item.name,source:'riot',url:f.url,patch:data.latestPatch.version,basePatch:f.patch,checkedAt,cost:f.cost,stats:f.stats,reviewedSources:pages.map(p=>p.url)};}
  if(item.official?.recipe||!f.recipe)continue;
  const cost=item.official?.cost||item.cost,parts=f.recipe.components.map(id=>data.items[id]?.official?.cost||data.items[id]?.cost);
  if(parts.some(n=>!Number.isInteger(n))||parts.reduce((a,b)=>a+b,0)+f.recipe.fee!==cost||f.recipe.fee<0)continue;
  item.official={...(item.official||{}),id,name:item.name,source:'riot',url:f.url,patch:data.latestPatch.version,basePatch:f.patch,checkedAt,cost,recipe:f.recipe,reviewedSources:pages.map(p=>p.url)};addedRecipes++;
 }
 const retryAfter=data.advancedEvidence?.retryAfter,failures=[],failureReasons={};let done=0,blocked=Date.parse(retryAfter)>Date.now();
 for(const c of data.champions){
  const old=c.rangeEvidence;if(old?.patch===data.latestPatch.version&&Date.now()-Date.parse(old.checkedAt)<6*3600000){done++;continue;}
  const url=data.counterSources?.pages?.[c.id]?.url||data.counterSources?.urls?.[c.id];if(!url||blocked){failures.push(c.id);continue;}
  try{c.rangeEvidence=parseRange(await fetchPage(url),c,data.latestPatch.version,url,new Date().toISOString());}catch(e){failures.push(c.id);failureReasons[c.id]=e.message;if(/429|403/.test(e.message))blocked=true;}
  onProgress(++done,data.champions.length);if(delay)await new Promise(r=>setTimeout(r,delay));
 }
 data.advancedEvidence={patch:data.latestPatch.version,checkedAt,addedRecipes,recipes:Object.values(data.items).filter(i=>i.official?.recipe).length,rangeChampions:data.champions.filter(c=>c.rangeEvidence?.patch===data.latestPatch.version).length,rangeFailures:failures,failureReasons,...(blocked?{retryAfter:Date.parse(retryAfter)>Date.now()?retryAfter:new Date(Date.now()+3600000).toISOString()}: {})};
 return data.advancedEvidence;
}
module.exports={parseAttackRules,parseRange,collectAdvancedEvidence};

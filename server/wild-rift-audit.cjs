const {normalizePatch}=require('./wild-rift-patch.cjs');
const HOSTS={wildriftcore:'wildriftcore.com',wrmeta:'wr-meta.com'};
const groups=['berserkers-greaves boots-of-mana boots-of-dynamism mercurys-treads plated-steelcaps ionian-boots-of-lucidity gluttonous-greaves','mortal-reminder seryldas-grudge lord-dominiks-regard terminus','trinity-force divine-sunderer iceborn-gauntlet lich-bane','steraks-gage maw-of-malmortius immortal-shieldbow'];
function extraBuildProblem(data,c,b){
 let url;try{url=new URL(b.source);}catch{return 'invalid-source';}
 if(url.protocol!=='https:'||url.hostname!==HOSTS[b.sourceId])return 'invalid-source';
 if(!c.roles.includes(b.role)||!c.builds.some(p=>p.role===b.role))return 'invalid-role';
 if(!normalizePatch(b.patch)||!Number.isFinite(Date.parse(b.fetchedAt))||Date.parse(b.fetchedAt)>Date.now()+300000)return 'invalid-provenance';
 if(!Array.isArray(b.final)||b.final.length!==6||new Set(b.final).size!==6)return 'invalid-slots';
 if(b.final.some(id=>data.itemRegistry.items[id]?.status!=='available'||data.itemRegistry.items[id]?.kind==='component'))return 'unavailable-item';
 if(groups.some(group=>b.final.filter(id=>group.split(' ').includes(id)).length>1))return 'conflicting-items';
 for(const key of ['core','starting','boots','situational','runes','spells','skillOrder'])if(!Array.isArray(b[key]))return 'missing-fields';
 if(b.runes.length!==5||b.spells.length!==2||b.skillOrder.length!==15)return 'invalid-loadout';
 if(b.core.some(id=>!b.final.includes(id)))return 'invalid-core';
 return null;
}
function auditSnapshot(data){
 const excluded=[],sources={wildriftfire:0,wildriftcore:0,wrmeta:0};
 for(const c of data.champions){
  sources.wildriftfire+=(c.builds||[]).length;const seen=new Set();
  c.sourceBuilds=(c.sourceBuilds||[]).filter(b=>{
   const key=b.sourceId+':'+b.role+':'+b.guideId,reason=seen.has(key)?'duplicate-guide':extraBuildProblem(data,c,b);seen.add(key);
   if(reason){excluded.push({champion:c.id,guideId:b.guideId,reason});return false;}sources[b.sourceId]++;return true;
  });
 }
 const provider=data.evidence?.providers.find(p=>p.id==='wrmeta');if(provider){provider.builds=sources.wrmeta;provider.buildChampions=data.champions.filter(c=>c.sourceBuilds.some(b=>b.sourceId==='wrmeta')).length;}
 data.qualityAudit={schema:1,checkedAt:new Date().toISOString(),patch:data.latestPatch.version,sources,excluded,
  abilityChampions:data.champions.filter(c=>c.combatFacts?.abilityFacts?.length).length,passiveItems:Object.values(data.items).filter(i=>i.passives?.length).length};
 return data.qualityAudit;
}
module.exports={extraBuildProblem,auditSnapshot};

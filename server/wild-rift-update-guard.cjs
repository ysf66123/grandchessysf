const fs=require('node:fs/promises');
const {comparePatch}=require('./wild-rift-source.cjs');
function metrics(d){
 const champs=d.champions||[],items=Object.values(d.items||{});
 return {champions:champs.length,builds:champs.reduce((n,c)=>n+(c.builds?.length||0)+(c.sourceBuilds?.length||0),0),abilities:champs.reduce((n,c)=>n+(c.combatFacts?.abilityFacts?.length||0),0),packets:champs.reduce((n,c)=>n+(c.combatFacts?.abilityFacts||[]).reduce((n,a)=>n+(a.damagePackets?.filter(p=>p.parsed).length||0),0),0),recipes:items.filter(i=>i.official?.recipe).length,passives:items.filter(i=>i.passives?.length).length,ranges:champs.filter(c=>c.rangeEvidence).length,attack:Object.keys(d.attackRules?.byChampion||{}).length,relationships:d.evidence?.relationships?.length||0};
}
function assessUpdate(previous,next){
 const before=previous?metrics(previous):null,after=metrics(next),errors=[];
 if(!previous)return {ok:true,before,after,errors};
 const patch=next.latestPatch?.version,same=patch===previous.latestPatch?.version;
 if(comparePatch(patch,previous.latestPatch.version)<0)errors.push('Yama geriye gidiyor.');
 for(const key of ['champions','builds','abilities','packets','passives','relationships']){
  const floor=key==='champions'?.95:same?.85:.65;
  if(before[key]>20&&after[key]<before[key]*floor)errors.push(key+' kapsamı '+before[key]+' → '+after[key]+' düştü.');
 }
 // Older facts can be retained with their original dates, then disabled by
 // freshness rules. An extractor must not silently erase them on a new patch.
 for(const key of ['recipes','ranges','attack'])if(before[key]>5&&after[key]<before[key]*.85)errors.push(key+' kanıt kapsamı beklenmedik biçimde azaldı.');
 const badRecipes=[];for(const i of Object.values(next.items||{})){
  const f=i.official;if(f?.patch!==patch||!f.recipe)continue;
  const parts=f.recipe.components?.map(id=>next.items[id]?.official?.patch===patch?next.items[id].official.cost:next.items[id]?.cost)||[];
  if(!parts.length||parts.some(n=>!Number.isFinite(n))||!Number.isFinite(f.recipe.fee)||f.recipe.fee<0||parts.reduce((a,b)=>a+b,0)+f.recipe.fee!==f.cost)badRecipes.push(i.id);
 }
 if(badRecipes.length)errors.push('Tarif fiyat toplamı uyuşmuyor: '+badRecipes.slice(0,5).join(', '));
 const states=new Map();let cyclic=false;
 function visit(id){if(states.get(id)===1){cyclic=true;return;}if(states.has(id))return;states.set(id,1);const f=next.items[id]?.official;if(f?.patch===patch)for(const part of f.recipe?.components||[])visit(part);states.set(id,2);}
 for(const id of Object.keys(next.items||{}))visit(id);
 if(cyclic)errors.push('Eşya tarifinde döngü var; parça indirimi güvenle hesaplanamıyor.');
 const priceJumps=[];for(const [id,i] of Object.entries(next.items||{})){
  const old=previous.items?.[id];if(!old?.cost||!i.cost||Math.abs(i.cost-old.cost)/old.cost<.3)continue;
  const official=i.official?.patch===patch&&i.official.cost===i.cost&&/^https:\/\/wildrift\.leagueoflegends\.com\//.test(i.official.url||'');
  if(!official)priceJumps.push(id);
 }
 if(priceJumps.length>=5)errors.push('Resmî kanıtla açıklanmayan toplu fiyat değişikliği: '+priceJumps.slice(0,5).join(', '));
 return {ok:!errors.length,before,after,errors,unverifiedPriceChanges:priceJumps};
}
function assertSafeUpdate(previous,next){const report=assessUpdate(previous,next);if(!report.ok){const e=Error('Güncelleme denetimi: '+report.errors.join(' ')+' Son sağlam paket korundu.');e.code='WR_UPDATE_REGRESSION';e.report=report;throw e;}return report;}
async function publishSnapshot(file,previous,next){
 require('./wild-rift-store.cjs').validateSnapshot(next);
 next.updateAudit={...assertSafeUpdate(previous,next),checkedAt:new Date().toISOString()};
 // Validation precedes all filesystem replacement and GitHub sync.
 const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(next));
 if(previous)await fs.copyFile(file,file+'.previous');
 await fs.rename(temp,file);return next.updateAudit;
}
module.exports={metrics,assessUpdate,assertSafeUpdate,publishSnapshot};

// Only positive, dated Wild Rift evidence can admit an item. A guide mentioning
// an item is not by itself sufficient; Riot removal always takes precedence.
const {comparePatch}=require('./wild-rift-source.cjs');
const BOOTS=new Set('berserkers-greaves boots-of-mana boots-of-dynamism mercurys-treads plated-steelcaps ionian-boots-of-lucidity gluttonous-greaves'.split(' '));
const fresh=(date,now)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=now+300000&&now-Date.parse(date)<=7*86400000;
function buildRegistry(data,now=Date.now()){
 const patch=data.latestPatch.version,items={},finals=new Set(),components=new Set();
 for(const c of data.champions)for(const b of c.builds||[])if(b.patch===patch&&!c.refreshFailed&&fresh(b.fetchedAt||c.fetchedAt,now))for(const id of b.final)finals.add(id);
 for(const i of Object.values(data.items))if(i.official?.patch===patch&&fresh(i.official.checkedAt,now))for(const id of i.official.recipe?.components||[])components.add(id);
 const catalog=data.itemCatalog,fire=new Set(catalog?.patch===patch&&fresh(catalog.checkedAt,now)?(catalog.entries||[]).map(e=>e.id):[]);
 for(const [id,item] of Object.entries(data.items)){
  if(item.removedIn&&comparePatch(item.removedIn,patch)<=0){items[id]={status:'removed',kind:'unknown',sources:['riot']};continue;}
  const official=item.official?.patch===patch&&fresh(item.official.checkedAt,now),core=item.coreFacts?.patch===patch&&fresh(item.coreFacts.checkedAt,now);
  const sources=[...(fire.has(id)?['wildriftfire']:[]),...(official?['riot']:[]),...(core?['wildriftcore']:[])];
  // Components named by current official recipes can be bought, but cannot
  // silently become a full-build replacement just because they have a price.
  const full=fire.has(id)||(finals.has(id)&&(official||core))||(core&&official&&!!item.official.recipe&&!components.has(id));
  const available=full||(official&&components.has(id))||(official&&!!item.official.cost);
  items[id]={status:available?'available':'unverified',kind:full?(BOOTS.has(id)?'boots':'complete'):'component',sources,
   checkedAt:official?item.official.checkedAt:fire.has(id)?catalog.checkedAt:core?item.coreFacts.checkedAt:null};
 }
 return {game:'wild-rift',patch,checkedAt:new Date(now).toISOString(),items};
}
module.exports={buildRegistry};

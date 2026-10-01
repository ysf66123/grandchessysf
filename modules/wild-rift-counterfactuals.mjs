import {itemFacts,BOOTS} from './wild-rift-item-rules.mjs?v=20261001-combat2';
import {finalItemAvailable} from './wild-rift-evidence.mjs?v=20261001-combat2';
import {incompatibleItem} from './wild-rift-build-fit.mjs?v=20261001-combat2';
import {itemName} from './wild-rift-tr.mjs?v=20261001-combat2';
const caches=new WeakMap();
// Hypotheses live only inside cloned drafts. Source gear is never installed
// as observed enemy gear in the real draft or returned context.
export function buildCounterfactuals(data,draft,result,evaluate){
 if(result.missing||!result.current||!result.context.rows.length)return [];
 let cache=caches.get(data);if(!cache)caches.set(data,cache=new Map());
 const key=JSON.stringify(draft)+'|'+result.final.join('|')+'|'+Math.floor(Date.now()/300000);
 if(cache.has(key))return cache.get(key);
 const cases=[],lane=result.context.rows.find(r=>r.lane)||result.context.rows.find(r=>r.target)||result.context.rows[0];
 const resistance=result.profile.damage==='magic'?'magicResist':result.profile.damage==='physical'?'armor':null;
 if(resistance){
  const enemyProfile=lane.buildScenarios.scenarios[0]?.profile;
  const sourceItems=o=>[...o.guide.final,...(o.guide.situational||[]).flatMap(s=>s.items||[])];
  const candidates=[...new Set(lane.buildScenarios.options.flatMap(sourceItems))].filter(id=>finalItemAvailable(data,id)&&!BOOTS.includes(id)&&!lane.gear.includes(id)&&(!enemyProfile||!incompatibleItem(data,id,enemyProfile))&&(itemFacts(data,id).stats[resistance]||0)>=25);
  const id=candidates.sort((a,b)=>(itemFacts(data,b).stats[resistance]||0)-(itemFacts(data,a).stats[resistance]||0)||a.localeCompare(b))[0];
  if(id){const next=structuredClone(draft);next.enemyItems={...next.enemyItems,[lane.id]:[...lane.gear,id]};cases.push({condition:lane.name+' '+itemName(id)+' alırsa',basis:'Rakibin güncel kaynak seti veya açık alternatifinde bulunan bir eşya için varsayım; satın aldığı anlamına gelmez.',source:lane.buildScenarios.options.find(o=>sourceItems(o).includes(id))?.guide.source,draft:next});}
 }
 const threat=result.context.rows.filter(r=>r.id!==draft.fed).sort((a,b)=>Number(['duo','mid'].includes(b.role))-Number(['duo','mid'].includes(a.role))||b.weight-a.weight)[0];
 if(threat){const next=structuredClone(draft);next.fed=threat.id;cases.push({condition:threat.name+' maçın öne çıkan tehdidi olursa',basis:'Yalnızca tehdit ağırlığı artırılarak yeniden hesaplandı; rakipte eşya veya altın varsayılmadı.',draft:next});}
 if(draft.phase!=='team'){const next=structuredClone(draft);next.phase='team';cases.push({condition:'Koridordan takım savaşına geçince',basis:'Aynı seçimlerle takım baskısı ağırlığı kullanılarak yeniden hesaplandı.',draft:next});}
 const rows=cases.slice(0,3).map(c=>{
  const next=evaluate(c.draft);if(next.missing)return null;
  const removed=result.final.filter(id=>!next.final.includes(id)),added=next.final.filter(id=>!result.final.includes(id));
  return {condition:c.condition,basis:c.basis,source:c.source||next.base.source,hypothetical:true,changed:!!added.length,removed,added,final:[...next.final],reason:next.metaSelection?.reason||'Kaynak seti ve karşı eşya kuralları yeniden hesaplandı.',confidence:next.confidence.label};
 }).filter(Boolean);
 cache.set(key,rows);if(cache.size>32)cache.delete(cache.keys().next().value);return rows;
}

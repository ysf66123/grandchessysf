import {ageInDays} from './wild-rift-quality.mjs?v=20260925-counters1';
import {priceEvidence,itemAvailability} from './wild-rift-evidence.mjs?v=20260925-counters1';
import {itemFacts,itemFamily,BOOTS,TRANSFORM_FROM,RULES_PATCH} from './wild-rift-item-rules.mjs?v=20260925-counters1';
export function itemCost(data,id,now=Date.now()){
  return priceEvidence(data,id,now).cost;
}
// Consume each owned component at most once; matching a completed parent takes
// precedence over its children. Missing recipes never imply a made-up discount.
export function completionCost(data,id,owned=[],now=Date.now()){
 const cost=itemCost(data,id,now);if(cost===null)return {cost:null,used:[],exact:false};
 const available=owned.map((id,index)=>({id,index})),used=[];let known=true,unresolved=false;
 function credit(target,path=new Set()){
   if(path.has(target)){known=false;return 0;}
   const direct=available.findIndex(x=>x.id===target);if(direct>=0){const value=itemCost(data,target,now);if(value===null){known=false;return 0;}used.push(available[direct].index);available.splice(direct,1);return value;}
   const item=data.items[target],official=item?.official;
   if(!official?.recipe||official.patch!==data.latestPatch.version||ageInDays(official.checkedAt,now)>7){unresolved=true;return 0;}
   const next=new Set(path);next.add(target);return official.recipe.components.reduce((n,c)=>n+credit(c,next),0);
 }
 const ownRecipe=data.items[id]?.official;
 if(owned.length&&!(ownRecipe?.recipe&&ownRecipe.patch===data.latestPatch.version&&ageInDays(ownRecipe.checkedAt,now)<=7)&&!owned.includes(id))return {cost,used:[],exact:false};
 const discount=credit(id);return {cost:Math.max(0,cost-discount),used,exact:known&&!(unresolved&&available.length)};
}
export function affordableComponents(data,id,gold,owned=[],now=Date.now()){
 const official=data.items[id]?.official;if(!official?.recipe||official.patch!==data.latestPatch.version||ageInDays(official.checkedAt,now)>7)return [];
 const candidates=[],seen=new Set();
 function walk(id,path=new Set()){
  if(path.has(id))return;const next=new Set(path);next.add(id);
  const item=data.items[id],details=completionCost(data,id,owned,now);
  if(!seen.has(id)&&itemAvailability(data,id)&&details.exact&&details.cost>0&&details.cost<=gold){candidates.push({id,cost:details.cost,used:details.used});seen.add(id);}
  if(item?.official?.patch===data.latestPatch.version)for(const child of item.official.recipe?.components||[])walk(child,next);
 }
 for(const child of official.recipe.components)walk(child);
 // Alternatives, not a shopping basket: do not suggest spending the same gold twice.
 return candidates.sort((a,b)=>b.cost-a.cost).slice(0,4);
}
export function purchasePlan(data,draft,result,now=Date.now()){
  if(result.missing)return null;
  const transform=data.latestPatch.version===RULES_PATCH?TRANSFORM_FROM:{};
  const toFinal=id=>result.final.find(f=>transform[f]===id)||id;
  const completed=new Set([...draft.locked,...(draft.owned||[]).filter(id=>result.final.includes(toFinal(id)))].map(toFinal));
  const core=(result.base.purchaseOrder||result.base.core).map(id=>result.final.find(f=>itemFamily(f)===itemFamily(id))).filter(Boolean);
  const boot=result.final.find(id=>BOOTS.includes(id)),defensiveBoot=result.changes.some(c=>c.to===boot)&&draft.phase==='lane'&&draft.ownState==='behind';
  const desired=defensiveBoot?[boot,...core]:[core[0],boot,...core.slice(1)];
  const order=[...new Set([...desired,...result.final].filter(Boolean))];
  let remaining=order.filter(id=>!completed.has(id));
  if(remaining.includes(draft.purchaseTarget))remaining=[draft.purchaseTarget,...remaining.filter(id=>id!==draft.purchaseTarget)];
  const costs=remaining.map(id=>itemCost(data,transform[id]||id,now)),slots=completed.size+(draft.owned||[]).filter(id=>!completed.has(toFinal(id))).length;
  let inventory=[...(draft.owned||[])].filter(id=>!completed.has(toFinal(id)));
  const rows=remaining.map((finalId,i)=>{const id=transform[finalId]||finalId,detail=completionCost(data,id,inventory,now),room=slots+1-detail.used.length<=6;if(detail.exact)inventory=inventory.filter((_,i)=>!detail.used.includes(i));return {id,finalId,cost:costs[i],completion:detail.cost,exact:detail.exact,room,affordable:room&&detail.exact&&detail.cost!==null&&detail.cost<=draft.gold};});
  // Without recipes, components cannot be discounted from a full item's price.
  // Do not invent an exact completion cost, even if the component's own price is known.
  const hasComponents=(draft.owned||[]).length>0;
  const early=[];
  if(result.current&&draft.phase==='lane'&&(draft.locked.length+(draft.owned||[]).length)<6){
    const target=remaining.find(id=>itemFacts(data,id,now).effects.antiHeal);
    const threats=(result.context?.rows||[]).filter(r=>r.lane&&r.keys.heal>=1);
    const recipe=data.items[target]?.official;
    if(target&&threats.length&&recipe?.patch===data.latestPatch.version&&ageInDays(recipe.checkedAt,now)<=7){
      for(const id of recipe.recipe?.components||[]){
        const cost=itemCost(data,id,now);
        if(itemFacts(data,id,now).effects.antiHeal&&!draft.owned.includes(id)&&cost!==null)early.push({id,target,cost,affordable:cost<=draft.gold,targets:threats.map(t=>t.name),delay:cost});
      }
    }
  }
  const starters=draft.phase==='lane'&&!completed.size&&!draft.owned.length?result.base.starting.filter(id=>itemAvailability(data,id)).map(id=>({id,cost:itemCost(data,id,now)})).filter(i=>i.cost!==null):[];
  return {rows,next:rows[0]||null,early:early.sort((a,b)=>a.cost-b.cost).slice(0,1),hasComponents,total:costs.every(c=>c!==null)?costs.reduce((a,b)=>a+b,0):null,
    totalCompletion:rows.every(r=>r.exact&&r.completion!==null)?rows.reduce((n,r)=>n+r.completion,0):null,starters,slots,
    transformations:result.final.filter(id=>transform[id]).map(id=>({from:transform[id],to:id,owned:completed.has(id)})),
    orderReason:draft.purchaseTarget&&remaining[0]===draft.purchaseTarget?'Seçtiğin alışveriş hedefi öne alındı.':defensiveBoot?'Geride olduğun koridorda savunma botu öne alındı; ilk ana eşyanın tamamlanması gecikir.':'Kaynak ana eşyaları esas alındı; bot ilk ana eşyanın ardından yerleştirildi. Bu sıra maç durumuna göre değiştirilebilir.',
    complete:remaining.length===0,exactCompletion:rows[0]?.exact??!hasComponents,components:remaining.length?affordableComponents(data,transform[remaining[0]]||remaining[0],draft.gold,draft.owned,now).filter(c=>slots+1-c.used.length<=6):[],
    message:hasComponents?'Resmî tarif bulunan eşyada uygun parçaların değeri bir kez düşülür. Tarif doğrulanmadıysa gösterilen liste fiyatı tamamlama bedeli değildir.':'Resmî yama fiyatları önceliklidir. Güncel kaynaklar çelişiyor ve resmî doğrulama yoksa fiyat hesabı durdurulur.'};
}

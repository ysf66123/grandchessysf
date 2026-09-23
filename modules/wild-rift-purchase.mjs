import {ageInDays} from './wild-rift-quality.mjs?v=20260923-wr3';
import {priceEvidence,itemAvailability} from './wild-rift-evidence.mjs?v=20260923-wr3';
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
  const remaining=result.final.filter(id=>!draft.locked.includes(id)),costs=remaining.map(id=>itemCost(data,id,now));
  let inventory=[...(draft.owned||[])];
  const rows=remaining.map((id,i)=>{const detail=completionCost(data,id,inventory,now);if(detail.exact)inventory=inventory.filter((_,i)=>!detail.used.includes(i));return {id,cost:costs[i],completion:detail.cost,exact:detail.exact,affordable:detail.exact&&detail.cost!==null&&detail.cost<=draft.gold};});
  // Without recipes, components cannot be discounted from a full item's price.
  // Do not invent an exact completion cost, even if the component's own price is known.
  const hasComponents=(draft.owned||[]).length>0;
  return {rows,next:rows[0]||null,hasComponents,total:costs.every(c=>c!==null)?costs.reduce((a,b)=>a+b,0):null,
    complete:remaining.length===0,exactCompletion:rows[0]?.exact??!hasComponents,components:remaining.length?affordableComponents(data,remaining[0],draft.gold,draft.owned,now):[],
    message:hasComponents?'Resmî tarif bulunan eşyada uygun parçaların değeri bir kez düşülür. Tarif doğrulanmadıysa gösterilen liste fiyatı tamamlama bedeli değildir.':'Resmî yama fiyatları önceliklidir. Güncel kaynaklar çelişiyor ve resmî doğrulama yoksa fiyat hesabı durdurulur.'};
}

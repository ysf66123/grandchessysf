import {ageInDays} from './wild-rift-quality.mjs?v=20260923-wr2';
export function itemCost(data,id,now=Date.now()){
  const item=data.items[id];
  return item&&Number.isInteger(item.cost)&&item.cost>=100&&item.cost<=10000&&item.costPatch===data.latestPatch.version&&ageInDays(item.costCheckedAt,now)<=7?item.cost:null;
}
export function purchasePlan(data,draft,result,now=Date.now()){
  if(result.missing)return null;
  const remaining=result.final.filter(id=>!draft.locked.includes(id)),costs=remaining.map(id=>itemCost(data,id,now));
  const rows=remaining.map((id,i)=>({id,cost:costs[i],affordable:costs[i]!==null&&costs[i]<=draft.gold}));
  // Without recipes, components cannot be discounted from a full item's price.
  // Do not invent an exact completion cost, even if the component's own price is known.
  const hasComponents=(draft.owned||[]).length>0;
  return {rows,next:rows[0]||null,hasComponents,total:costs.every(c=>c!==null)?costs.reduce((a,b)=>a+b,0):null,
    complete:remaining.length===0,exactCompletion:!hasComponents,
    message:hasComponents?'Parça tarifleri kaynakta doğrulanmadığı için parçaların değeri düşülmedi. Aşağıdaki fiyatlar sıfırdan tam eşya fiyatıdır; tamamlama bedeli değildir.':'Fiyatlar kaynak kataloğundaki tam eşya bedelidir. Sıralama şampiyon rehberinden gelir; bot zamanlamasını koridor baskısına göre ayarla.'};
}

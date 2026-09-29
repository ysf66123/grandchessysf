import {ageInDays} from './wild-rift-quality.mjs?v=20260930-critical1';
import {priceEvidence,itemAvailability} from './wild-rift-evidence.mjs?v=20260930-critical1';
import {itemFacts,itemFamily,BOOTS,SUPPORT_ITEMS,TRANSFORM_FROM,rulesUsable} from './wild-rift-item-rules.mjs?v=20260930-critical1';
import {coverage,contextUtility} from './wild-rift-build-planner.mjs?v=20260930-critical1';
import {application} from './wild-rift-build-fit.mjs?v=20260930-critical1';
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
 return candidates.sort((a,b)=>b.cost-a.cost);
}
export function purchasePlan(data,draft,result,now=Date.now()){
  if(result.missing)return null;
  const transform=rulesUsable(data)?TRANSFORM_FROM:{};
  const toFinal=id=>result.final.find(f=>transform[f]===id)||id;
  const completed=new Set([...draft.locked,...(draft.owned||[]).filter(id=>result.final.includes(toFinal(id)))].map(toFinal));
  const core=(result.base.purchaseOrder||result.base.core).map(id=>result.final.find(f=>itemFamily(f)===itemFamily(id))||result.final[result.base.final.indexOf(id)]).filter(id=>id&&!BOOTS.includes(id));
  const boot=result.final.find(id=>BOOTS.includes(id)),laneRows=(result.context?.rows||[]).filter(r=>r.lane),laneMagic=laneRows.reduce((n,r)=>n+r.keys.magic*r.weight,0),lanePhysical=laneRows.reduce((n,r)=>n+r.keys.physical*r.weight,0);
  const defensiveBoot=draft.phase==='lane'&&draft.ownState==='behind'&&(boot==='mercurys-treads'&&laneMagic>=1.8||boot==='plated-steelcaps'&&lanePhysical>=1.8);
  const desired=defensiveBoot?[boot,...core]:[core[0],boot,...core.slice(1)];
  const income=draft.role==='support'?result.final.find(id=>SUPPORT_ITEMS.includes(id)):null;
  let order=[...new Set([income,...desired,...result.final].filter(Boolean))];
  const anchors=new Set([income,...core.slice(0,2),boot]);
  if(result.current&&result.context?.rows.length){
   const flexible=order.filter(id=>!anchors.has(id));
   const ranked=flexible.map((id,i)=>({id,score:contextUtility(result.context.pressure,coverage([id],data,result.profile),draft)-i*.65})).sort((a,b)=>b.score-a.score);
   let cursor=0;order=order.map(id=>anchors.has(id)?id:ranked[cursor++].id);
  }
  let remaining=order.filter(id=>!completed.has(id));
  if(remaining.includes(draft.purchaseTarget))remaining=[draft.purchaseTarget,...remaining.filter(id=>id!==draft.purchaseTarget)];
  const costs=remaining.map(id=>itemCost(data,transform[id]||id,now)),slots=completed.size+(draft.owned||[]).filter(id=>!completed.has(toFinal(id))).length;
  let inventory=[...(draft.owned||[])].filter(id=>!completed.has(toFinal(id)));
  const rows=remaining.map((finalId,i)=>{const id=transform[finalId]||finalId,detail=completionCost(data,id,inventory,now),room=completed.size+i+inventory.length+1-detail.used.length<=6;if(detail.exact)inventory=inventory.filter((_,i)=>!detail.used.includes(i));return {id,finalId,cost:costs[i],completion:detail.cost,exact:detail.exact,room,affordable:i===0&&room&&detail.exact&&detail.cost!==null&&detail.cost<=draft.gold};});
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
        if(application(data,id,result.profile,'heal').factor>=.75&&!draft.owned.includes(id)&&cost!==null)early.push({id,target,cost,affordable:cost<=draft.gold,targets:threats.map(t=>t.name),delay:cost,kind:'heal',reason:'Koridordaki iyileşmeyi sınırlamak için erken parça.',priority:3});
      }
    }
  }
  // Defensive detours must build into the selected final set, never an
  // unrelated item that would later need selling. Existing parts count once.
  if(result.current&&draft.phase==='lane'&&draft.ownState==='behind'&&slots<6){
   for(const target of remaining){
    const official=data.items[transform[target]||target]?.official;
    if(official?.patch!==data.latestPatch.version||ageInDays(official.checkedAt,now)>7)continue;
    for(const id of official.recipe?.components||[]){
     if(draft.owned.includes(id)||early.some(e=>e.id===id))continue;
     const f=itemFacts(data,id,now),cost=itemCost(data,id,now),need=laneMagic>=1.8&&(f.stats.magicResist||0)>=15?'magic':lanePhysical>=1.8&&(f.stats.armor||0)>=15?'physical':null;
     if(!need||cost===null||cost>1200)continue;
     early.push({id,target,cost,affordable:cost<=draft.gold,targets:laneRows.filter(r=>r.keys[need]>.5).map(r=>r.name),delay:cost,kind:need,reason:need==='magic'?'Koridordaki büyü baskısına karşı erken büyü direnci.':'Koridordaki fiziksel baskıya karşı erken zırh.',priority:2.5});
    }
   }
  }
  const starters=draft.phase==='lane'&&!completed.size&&!draft.owned.length?result.base.starting.filter(id=>itemAvailability(data,id)).map(id=>({id,cost:itemCost(data,id,now)})).filter(i=>i.cost!==null):[];
  const components=remaining.length?affordableComponents(data,transform[remaining[0]]||remaining[0],draft.gold,draft.owned,now).filter(c=>slots+1-c.used.length<=6):[];
  const profile=result.profile;
  const value=id=>{const s=itemFacts(data,id,now).stats;return (s.ad||0)*(profile.damage==='physical'?1.2:.1)+(s.ap||0)*(profile.damage==='magic'?1:.2)+(s.attackSpeed||0)*(profile.attack?1.3:.15)+(s.health||0)*(profile.tank?.12:.04)+(s.armor||0)*Math.min(1.2,(result.context?.pressure.physical||0)/5)+(s.magicResist||0)*Math.min(1.2,(result.context?.pressure.magic||0)/5)+(s.haste||0)*.7;};
  components.sort((a,b)=>value(b.id)-value(a.id)||b.cost-a.cost);components.splice(4);
  early.sort((a,b)=>b.priority-a.priority||a.cost-b.cost);
  const next=rows[0],earlyChoice=early.find(e=>e.affordable),component=components[0];
  const action=!next?{kind:'complete',text:'Son dizilim tamamlandı.'}:next.affordable?{kind:'complete-item',id:next.id,cost:next.completion,text:'Altının yetiyor: sıradaki eşyayı tamamla. Ana güçlenme anını parçalarla geciktirme.'}:earlyChoice&&!draft.purchaseTarget?{kind:'counter-component',id:earlyChoice.id,cost:earlyChoice.cost,returnTo:next.id,text:earlyChoice.reason+' Bu parçadan sonra ana eşya rotasına dön; tam karşı eşyayı hemen bitirmek zorunda değilsin.'}:component?{kind:'component',id:component.id,cost:component.cost,text:'Ana eşyanın doğrulanmış tarifinden, şampiyonunun düzenine ve koridor baskısına uygun parça.'}:{kind:'save',id:next.id,text:!next.room?'Envanter dolu; uygun parçaların birleşmesini bekle.':next.exact?'Bütçene uygun doğrulanmış tarif parçası yok; sıradaki eşya için altın biriktir.':'Tarif veya fiyat eksik; tamamlama bedelini oyun mağazasında doğrula.'};
  const spikes=[];
  if(rulesUsable(data)&&result.final.includes('yun-tal-wildarrows'))spikes.push('Yun Tal alındığı anda %0 kritik ihtimali verir; normal saldırılarla kalıcı olarak en fazla %25 biriktirir. Birikmiş güç, ilk satın alma gücü sayılmaz.');
  if(rulesUsable(data)&&result.champion.id==='kaisa')spikes.push("Kai’Sa, Wild Rift’te tam eşya yükseltmesiyle yetenek geliştirir. İlk tam eşyayı gereksiz ara alışverişlerle geciktirme; PC sürümündeki nitelik eşikleri kullanılmaz.");
  if(Object.keys(transform).some(id=>result.final.includes(id)))spikes.push('Birikimli eşyanın mağazada alınan biçimi ile dönüşmüş biçimi ayrı tutulur; dönüşümün tamamlandığı varsayılmaz.');
  if(result.profile.onHit)spikes.push('Vuruş etkisi ve saldırı hızı düzeninin ana eşyaları birlikte korunur; tek bir karşı etki için bu düzen tamamen dağıtılmaz.');
  if(result.profile.native?.fixedAttackRate)spikes.push('Saldırı hızı bu şampiyonda saldırı ritmini doğrudan hızlandırmaz; kaynak yeteneğindeki dönüşüm dikkate alınır. Çok vuruş isteyen pasifler aynı değerde sayılmaz.');
  if(result.context?.nativeAntiHeal)spikes.push('Yeteneklerinde iyileşme azaltma var. Ek eşyanın önceliği düşürüldü; yeteneğin her hedefte sürekli uygulanacağı varsayılmadı.');
  return {rows,next:rows[0]||null,early:early.slice(0,2),hasComponents,total:costs.every(c=>c!==null)?costs.reduce((a,b)=>a+b,0):null,
    action,spikes,components,
    totalCompletion:rows.every(r=>r.exact&&r.completion!==null)?rows.reduce((n,r)=>n+r.completion,0):null,starters,slots,
    transformations:result.final.filter(id=>transform[id]).map(id=>({from:transform[id],to:id,owned:completed.has(id)})),
    orderReason:draft.purchaseTarget&&remaining[0]===draft.purchaseTarget?'Seçtiğin alışveriş hedefi öne alındı.':defensiveBoot?'Geride olduğun koridorda savunma botu öne alındı; ilk ana eşyanın tamamlanması gecikir.':'Kaynağın ana eşyaları ve bot zamanlaması korunur; sonraki esnek eşyalar mevcut koridor/takım ihtiyaçlarına göre sıralanır. Altı yuvalı son görünüm satın alma sırası değildir.',
    complete:remaining.length===0,exactCompletion:rows[0]?.exact??!hasComponents,
    message:hasComponents?'Resmî tarif bulunan eşyada uygun parçaların değeri bir kez düşülür. Tarif doğrulanmadıysa gösterilen liste fiyatı tamamlama bedeli değildir.':'Resmî yama fiyatları önceliklidir. Güncel kaynaklar çelişiyor ve resmî doğrulama yoksa fiyat hesabı durdurulur.'};
}

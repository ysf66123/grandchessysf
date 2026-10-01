import {ageInDays} from './wild-rift-quality.mjs?v=20261001-combat3';
import {itemFacts,TRANSFORM_FROM} from './wild-rift-item-rules.mjs?v=20261001-combat3';
export function verifiedCombat(data,champion){
 const f=champion?.combatFacts;if(!f||f.patch!==data.latestPatch.version||ageInDays(f.checkedAt)>7)return null;
 const review=data.combatReview?.patch===data.latestPatch.version&&ageInDays(data.combatReview.checkedAt)<=7?data.combatReview.champions?.[champion.id]:null;
 const changed=data.patchImpact?.champions?.includes(champion.id),stats=structuredClone(f.stats),blocked=new Set(),warnings=[];
 if(review){
  if(review.attack?.length){delete stats.attackSpeed;warnings.push('Saldırı hızı, resmî şampiyon oranı ve seviyeye bağlı özel modelle hesaplanır; kaynak panelindeki doğrusal hız artışı kullanılmaz.');}
  for(const s of review.stats||[])if(stats[s.key]&&Number.isFinite(s.current)){stats[s.key][s.part]=s.current;if(s.status==='conflict')warnings.push('Kaynak '+({armor:'zırh',health:'can',magicResist:'büyü direnci',ad:'saldırı gücü'}[s.key]||s.key)+' değeri resmî yamayla çelişiyor; hesapta Riot değeri kullanıldı.');}
  for(const a of review.abilities||[])if(a.numericExcluded)for(const slot of a.slots)blocked.add(slot);
  if(review.abilities?.some(a=>a.status==='unmapped'))warnings.push('Resmî yamada değişen bazı alt yetenekler kaynak yuvalarıyla kesin eşleştirilemedi; doğrulanmış toplam hasar olarak gösterilmez.');
 }else if(changed){for(const a of f.abilityFacts||[])blocked.add(a.slot);for(const k of Object.keys(stats))delete stats[k];warnings.push('Yamada değişen şampiyon için sayısal karşılaştırma doğrulanamadı; kesin nitelik ve yetenek hasarı hesabı bekletildi.');}
 const abilityFacts=(f.abilityFacts||[]).map(a=>({...a,...(blocked.has(a.slot)||a.exclusiveChoices?{numericExcluded:true}:{}),...(review?.abilities?.some(r=>r.slots.includes(a.slot)&&/^Cooldown$/i.test(r.label)&&r.status!=='verified')?{baseCooldown:undefined}:{} )}));
 if(abilityFacts.some(a=>a.numericExcluded))warnings.push('Çelişkili veya birbirini dışlayan yetenek sayıları kesin hasar toplamına katılmıyor.');
 return {...f,stats,abilityFacts,review,warnings};
}
export function combatWindow(profile,window='balanced'){
 const short={attacks:profile.attack?1:0,abilities:1,label:'Kısa takas'},extended={attacks:profile.native?.fixedAttackRate?3:profile.attack?6:1,abilities:3,label:'Uzayan çatışma'};
 return window==='short'?short:window==='extended'?extended:{attacks:profile.attack?3:0,abilities:2,label:'Dengeli referans'};
}
function effectValue(effect,profile,window){
 if(effect.trigger==='permanent')return effect.value;
 const w=combatWindow(profile,window);
 if(effect.trigger==='alternatingAttacks'&&!effect.cycleVerified)return window==='completed'?effect.value:0;
 const hits=effect.trigger==='magicAbility'?(profile.damage==='physical'&&!profile.native?.magicOnAttack?0:w.abilities):effect.trigger==='physicalDamage'?(profile.damage==='magic'&&!profile.attack?0:w.attacks+w.abilities):0;
 return Math.min(effect.value,(effect.perStack||0)*hits);
}
export function penetrationEffects(data,items,profile,window='balanced'){
 return items.flatMap(id=>itemFacts(data,id).mechanics.penetration||[]).map(p=>({...p,applied:effectValue(p,profile,window)}));
}
export function resistanceAfter(value,effects,channel){
 if(channel==='true')return value;
 const rows=effects.filter(p=>p.channel===channel),reduction=rows.filter(p=>p.kind==='percentReduction').reduce((n,p)=>n*(1-p.applied),1),percent=rows.filter(p=>p.kind==='percentPen').reduce((n,p)=>n*(1-p.applied),1),flat=rows.filter(p=>p.kind==='flatPen').reduce((n,p)=>n+p.applied,0);
 // A positive-resistance reference, not a claim about a live damage formula.
 return Math.max(0,value*reduction*percent-flat);
}
export function penetrationAssessment(data,items,profile,context,window='balanced'){
 const effects=penetrationEffects(data,items,profile,window),rows=[];
 for(const target of context?.rows||[]){
  for(const [channel,key] of [['physical','armor'],['magic','magicResist']]){
   if(profile.damage!==channel&&profile.damage!=='mixed')continue;
   const native=target.native?.stats?.[key];if(!native)continue;
   const observed=target.stats[key]||0,scenarios=[{label:'9. seviye + yalnızca gözlenen eşya',value:native.base+native.growth*8+observed,source:target.native.source}];
   const alternatives=target.buildScenarios?.scenarios||[];
   for(const s of alternatives.slice(0,3)){const extra=s.profile?.stats?.[key]||0;if(extra>observed)scenarios.push({label:'9. seviye + kaynak seti varsayımı',value:native.base+native.growth*8+extra,source:s.source||s.profile.evidence});}
   const seen=new Set();for(const s of scenarios){const k=Math.round(s.value*100);if(seen.has(k))continue;seen.add(k);const remaining=resistanceAfter(s.value,effects,channel);rows.push({target:target.name,id:target.id,channel,initial:s.value,remaining,removed:s.value-remaining,...s});}
  }
 }
 const covers={};for(const [channel,key] of [['physical','armor'],['magic','magicResist']]){
  const rs=rows.filter(r=>r.channel===channel);if(rs.length)covers[key]=Math.min(1.1,rs.reduce((n,r)=>n+(r.initial>0?r.removed/r.initial:0),0)/rs.length*2);
 }
 return {effects,rows,covers,basis:'Pozitif direnç referansı: azaltma → yüzdelik delme → sabit delme. Kaynak setleri varsayımdır; rakibin gerçek alışverişi sayılmaz. Bu panel DPS veya tam hasar simülasyonu değildir; gerçek hasara delme katkısı eklenmez.'};
}
export function growthStages(data,id,profile){
 const parent=TRANSFORM_FROM[id],g=itemFacts(data,parent||id).mechanics.growth||{},rows=[];
 for(const e of Object.values(g)){
  const max=e.maximum;if(!Number.isFinite(max))continue;
  const ticks=e.stat==='crit'?Math.ceil(max/(profile.native?.rangeMode==='melee'?e.perMelee:e.perRanged||e.perMelee)):e.stat==='mana'?Math.ceil(max/e.perTrigger):e.maxStacks;
  rows.push({id,parent,stat:e.stat,permanent:e.permanent,fresh:0,partial:max/2,completed:max,trigger:e.trigger,required: ticks,minimumSeconds:e.windowSeconds?Math.floor((ticks-1)/e.triggersPerWindow)*e.windowSeconds:null,transformed:!!parent});
 }
 return rows;
}
export function stackReadiness(data,id,profile,window='balanced'){
 const f=itemFacts(data,id),w=combatWindow(profile,window),ps=f.passives.filter(p=>p.maxStacks&&p.trigger==='attack'&&!f.mechanics.growth?.critical),pen=f.mechanics.penetration?.filter(p=>p.maxStacks)||[];
 const factors=ps.map(p=>Math.min(1,w.attacks*(p.stacksPerTrigger||1)/p.maxStacks));
 for(const p of pen)if(p.trigger==='alternatingAttacks')factors.push(p.cycleVerified?Math.min(1,w.attacks/6):window==='extended'?.45:.15);
 return factors.length?Math.max(.1,Math.min(...factors)):1;
}
export function targetApplication(data,id,profile,need,target=null){
 const f=itemFacts(data,id),trigger=f.mechanics[need==='heal'?'antiHeal':'antiShield'];
 if(!f.effects[need==='heal'?'antiHeal':'antiShield'])return {factor:0,reason:'Güncel karşı etki doğrulanmadı.'};
 if(!trigger||trigger==='unknown')return {factor:.45,reason:'Uygulama koşulu doğrulanamadı; tam katkı sayılmadı.'};
 let factor=1,reason=({physicalDamage:'Fiziksel hasarla',magicDamage:'Büyü hasarıyla',abilityDamage:'Yetenek hasarıyla',damage:'Hasarla',damageOrIncomingAttack:'Hasarla veya hedefin saldırısını alarak',incomingAttack:'Hedefin normal saldırısını alarak'})[trigger]+' uygulanır.';
 if(trigger==='incomingAttack'){
  factor=profile.tank?.8:.35;
  if(target&&!target.keys?.attack){factor=.15;reason+=' Bu hedefin baskısı normal saldırı ağırlıklı doğrulanmadı.';}
  reason+=' Başka bir rakibin saldırısını almak bu hedefe etki uygulamaz.';
 }
 if(trigger==='physicalDamage'&&profile.damage==='magic'&&!profile.attack||trigger==='magicDamage'&&profile.damage==='physical')factor=.25;
 if(f.mechanics.rangeDependent||f.mechanics.areaDependent){factor*=.8;reason+=' Alan/menzil koşulu nedeniyle tam etki varsayılmadı.';}
 if(target){
  const melee=profile.native?.rangeMode==='melee',ranged=target.native?.mechanics?.rangeMode==='ranged',mobility=profile.native?.mobility||(profile.champion?.combatFacts?.abilityFacts||[]).some(a=>a.flags.mobility),abilityAccess=(profile.champion?.combatFacts?.abilityFacts||[]).some(a=>a.flags.projectile||a.flags.targeted);
  if(melee&&ranged&&!mobility&&!abilityAccess){factor*=.65;reason+=' Yakın dövüşle bu uzak hedefe erişim sınırlı; yalnızca eşyanın bulunması yeterli sayılmadı.';}
  reason+=' İsabet veya rakibin konumu canlı okunmaz.';
 }
 return {factor,reason,trigger,target:target?.name||null};
}
export function duoAbilityPlan(data,draft){
 if(!['duo','support'].includes(draft.role))return null;
 const own=data.champions.find(c=>c.id===draft.blue[draft.role]),partner=data.champions.find(c=>c.id===draft.blue[draft.role==='duo'?'support':'duo']);if(!own||!partner)return null;
 const pair=[own,partner].map(c=>({c,f:verifiedCombat(data,c)})),enemies=['duo','support'].map(r=>data.champions.find(c=>c.id===draft.red[r])).filter(Boolean),slot=a=>a.slot==='P'?'pasif':a.slot==='4'?'ulti':a.slot+'. yetenek';
 const opener=pair.flatMap(p=>(p.f?.abilityFacts||[]).filter(a=>a.flags.control).map(a=>({...p,a}))).sort((a,b)=>Number(a.c===own)-Number(b.c===own))[0];
 const follow=opener?pair.find(p=>p.c.id!==opener.c.id):pair[0],damage=(follow?.f?.abilityFacts||[]).find(a=>a.slot!=='P'&&a.damageTypes.length),exit=pair.flatMap(p=>(p.f?.abilityFacts||[]).filter(a=>a.flags.mobility&&!a.flags.mobilityRequiresEnemy||a.flags.shield||a.flags.immunity||a.flags.control).map(a=>({...p,a})))[0];
 const steps=[{title:'Birlikte açılış',text:opener?opener.c.name+' '+slot(opener.a)+' kontrolü isabet ederse takip et. '+(opener.a.flags.collision?'İlk hedefe çarpma koşulunda minyon hattını dikkate al.':'Partnerin takip mesafesinde olsun.'):'Doğrulanmış giriş kontrolü bulunamadı; aynı hedefe kısa baskı kur, zorla giriş yapma.'},{title:'Aynı hedefe takip',text:damage?follow.c.name+' '+slot(damage)+' hasarını kontrol penceresinde aynı hedefe yönelt. Yeteneklerin hazır olduğunu ve isabetini uygulama varsaymaz.':'Kaynak yetenek kapsamı eksik; kesin kombodan söz edilmez.'},{title:'Güvenli çıkış',text:exit?exit.c.name+' '+slot(exit.a)+' '+(exit.a.flags.mobility&&!exit.a.flags.mobilityRequiresEnemy?'hareket seçeneğini':exit.a.flags.immunity?'dokunulmazlık seçeneğini':exit.a.flags.control?'takibi kesebilen kontrol seçeneğini':'koruma seçeneğini')+' çıkış için saklayabilir. Rakip tepki vermeden partnerinden kopma.':'Kaçış/koruma yuvası kaynakta doğrulanmadı; takası güvenli mesafede kes.'}];
 const reactions=enemies.flatMap(c=>(verifiedCombat(data,c)?.abilityFacts||[]).filter(a=>a.flags.control||a.flags.immunity).slice(0,1).map(a=>c.name+' '+slot(a)+': '+(a.flags.immunity?'dokunulmazlık sırasında takip hasarını harcama.':'kontrolü boşa çıkmadan iki kişi aynı giriş açısında kalma.')));
 return {steps,reactions,complete:enemies.length===2,sources:pair.map(p=>p.f?.source).filter(Boolean),basis:'Seçilen iki müttefikin ve bilinen rakip ikilinin güncel yetenek kayıtları. Canlı bekleme süresi, kesin kombo veya kazanma garantisi değildir.'};
}
export function contextApplication(data,id,profile,need,context){
 const base=targetApplication(data,id,profile,need),rows=(context?.rows||[]).filter(r=>r.keys[need]>0).map(r=>({...targetApplication(data,id,profile,need,r),weight:r.keys[need]*r.weight})),total=rows.reduce((n,r)=>n+r.weight,0);
 if(!total)return {...base,rows:[]};
 const factor=rows.reduce((n,r)=>n+r.factor*r.weight,0)/total,limited=rows.filter(r=>r.factor<.75).map(r=>r.target);
 return {...base,factor,rows,reason:base.reason+(limited.length?' Uygulaması sınırlı hedefler: '+limited.join(', ')+'.':'')};
}

import {itemFacts,BOOTS,SUPPORT_ITEMS,rulesUsable} from './wild-rift-item-rules.mjs?v=20261001-combat2';
import {traits} from './wild-rift-knowledge.mjs?v=20261001-combat2';
import {ageInDays} from './wild-rift-quality.mjs?v=20261001-combat2';
import {abilityProfile} from './wild-rift-ability-profile.mjs?v=20261001-combat2';
import {attackModel} from './wild-rift-attack-model.mjs?v=20261001-combat2';
import {verifiedCombat,targetApplication} from './wild-rift-combat-evaluation.mjs?v=20261001-combat2';
export function itemTotals(data,ids){
 const totals={},unknown=[],uncertainStats=new Set();
 for(const id of ids){const f=itemFacts(data,id);if(!f.known||f.conflicts.length)unknown.push(id);if(!f.known)uncertainStats.add('*');for(const key of f.conflicts)uncertainStats.add(key);for(const [k,n] of Object.entries(f.stats))if(Number.isFinite(n))totals[k]=(totals[k]||0)+n;}
 return {stats:totals,unknown,uncertainStats:[...uncertainStats],scalingCrit:rulesUsable(data)?ids.reduce((n,id)=>n+(itemFacts(data,id).mechanics.growth?.critical?.maximum||0),0):0};
}
export function combatFacts(data,champion,level){
 const f=verifiedCombat(data,champion);
 if(!f||f.patch!==data.latestPatch.version||ageInDays(f.checkedAt)>7)return null;
 const stats={};if(Number.isInteger(level)&&level>=1&&level<=15)for(const [k,v] of Object.entries(f.stats))stats[k]=v.base+v.growth*(level-1);
 return {...f,level:level||null,atLevel:stats};
}
export function championProfile(data,champion,base){
 const total=itemTotals(data,base.final.filter(id=>!BOOTS.includes(id))),s=total.stats,t=traits(champion),combat=combatFacts(data,champion);
 const native=combat?.mechanics||{},ap=s.ap||0,ad=s.ad||0,attack=!!native.magicOnAttack||(s.attackSpeed||0)>=35||(s.crit||0)>=40||base.core.some(id=>['blade-of-the-ruined-king','guinsoos-rageblade','nashors-tooth','kraken-slayer'].includes(id));
 const mixed=ap>=70&&ad>=50;
 const ordered=[...new Set([...(base.purchaseOrder||base.core),...base.final].map(id=>base.final.includes(id)?id:null).filter(id=>id&&!BOOTS.includes(id)))];
 const stages=[5,9,13].map((level,i)=>{const itemIds=ordered.slice(0,[1,3,5][i]);return {level,itemIds,stats:itemTotals(data,itemIds).stats};});
 const ability=abilityProfile(combat,s,attack,base,stages);
 const damage=ability.damage||(mixed?'mixed':ap>ad*1.25&&ap>=70?'magic':ad>=50?'physical':t.magic?'magic':t.mixed?'mixed':t.attack?'physical':'unknown');
 const support=base.role==='support'&&base.final.some(id=>SUPPORT_ITEMS.includes(id));
 const tank=(s.armor||0)+(s.magicResist||0)>=100&&ad<110&&ap<140;
 const kind=support?(tank?'supportTank':'support'):tank?'tank':mixed?'hybrid':damage==='magic'?(attack?'onHitMage':'mage'):attack?((s.crit||0)+total.scalingCrit>=50?'crit':'onHit'):'fighter';
 const labels={supportTank:'Ön saf desteği',support:'Takım desteği',tank:'Dayanıklı ön saf',hybrid:'Karma hasar',onHitMage:'Büyü ve normal saldırı',mage:'Yetenek hasarı',crit:'Kritik ve normal saldırı',onHit:'Sürekli normal saldırı',fighter:'Fiziksel yetenek / dövüşçü'};
 const core=base.core.filter(id=>!BOOTS.includes(id)),spellblade=core.some(id=>['trinity-force','divine-sunderer','iceborn-gauntlet','lich-bane'].includes(id));
 const onHit=core.some(id=>['guinsoos-rageblade','nashors-tooth','blade-of-the-ruined-king','kraken-slayer'].includes(id));
 const coreFacts=core.map(id=>itemFacts(data,id)),sustained=coreFacts.some(f=>f.mechanics.healthDamage)||onHit;
 const style=native.fixedAttackRate?'fixedAttack':support?kind:tank?'tank':kind==='crit'?'crit':onHit?'onHit':damage==='magic'?(sustained?'sustainedMage':'burstMage'):'adCaster';
 const styleLabels={fixedAttack:'Sabit saldırı ritmi',support:'Koruyucu destek',supportTank:'Ön saf desteği',tank:'Dayanıklı ön saf',crit:'Kritik vuruş',onHit:'Vuruş etkisi',sustainedMage:'Sürekli büyü hasarı',burstMage:'Yetenek ve ani büyü hasarı',adCaster:'Fiziksel yetenek / dövüşçü'};
 return {kind,label:styleLabels[style]||labels[kind],style,damage,threatDamage:ability.damage|| (t.mixed?'mixed':damage),ability,attack,support,tank,spellblade,onHit,sustained,native,attackModel:attackModel(data,champion,s,base.final),scalingCrit:total.scalingCrit,usesMana:combat?.usesMana??null,stats:s,unknown:total.unknown,champion,
  signature:core.filter(id=>itemFacts(data,id).mechanics.spellblade||['guinsoos-rageblade','nashors-tooth'].includes(id)),evidence:combat?.source||base.source};
}
export function application(data,id,profile,need){
 if(['heal','shield'].includes(need))return targetApplication(data,id,profile,need);
 const facts=itemFacts(data,id),trigger=facts.mechanics[need==='heal'?'antiHeal':'antiShield'];
 if(!['heal','shield'].includes(need))return {factor:1,reason:''};
 if(!facts.effects[need==='heal'?'antiHeal':'antiShield'])return {factor:0,reason:'Güncel karşı etki doğrulanmadı.'};
 if(!trigger||trigger==='unknown')return {factor:.45,reason:'Etkinin uygulama koşulu tam doğrulanmadı; katkısı sınırlı sayıldı.'};
 if(trigger==='incomingAttack')return {factor:profile.tank?.85:.35,reason:'Etki, rakibin sana normal saldırı yapmasını gerektirir; uzaktan büyü hasarına karşı sürekli uygulanmış sayılmaz.'};
 if(trigger==='physicalDamage'&&profile.damage==='magic'&&!profile.attack)return {factor:.25,reason:'Etki fiziksel hasar istiyor; bu dizilim ağırlıklı büyü hasarı veriyor.'};
 if(trigger==='magicDamage'&&profile.damage==='physical')return {factor:.25,reason:'Etki büyü hasarı istiyor; bu dizilim ağırlıklı fiziksel hasar veriyor.'};
 const conditional=facts.mechanics.rangeDependent||facts.mechanics.areaDependent;
 return {factor:conditional?.8:trigger==='damageOrIncomingAttack'&&!profile.tank?.85:1,conditional,reason:(({physicalDamage:'Fiziksel hasar verdiğin hedefe uygulanır.',magicDamage:'Büyü hasarı verdiğin hedefe uygulanır.',abilityDamage:'Yetenek hasarı verdiğin hedefe uygulanır; alan ve tek hedef etkisi farklı olabilir.',damage:'Hasar verdiğin hedefe uygulanır; yakın ve uzak dövüş etkisi farklı olabilir.',damageOrIncomingAttack:'Hasar verdiğin veya normal saldırısını aldığın hedefe uygulanır.'})[trigger]||'')+(conditional?' Kaynakta menzil/alan koşulu var; tam etki varsayılmadı.':'')};
}
export function incompatibleItem(data,id,profile){
 const facts=itemFacts(data,id),f=facts.stats;
 if(facts.mechanics.restriction&&profile.native?.rangeMode!==facts.mechanics.restriction)return true;
 if(BOOTS.includes(id))return false;
 if(profile.support&&profile.damage==='magic'&&(f.ad||0)>=35&&(f.ap||0)===0)return true;
 if(profile.tank&&(f.crit||0)>=20)return true;
 if(profile.tank||profile.support||profile.kind==='hybrid')return false;
 if(profile.damage==='magic'&&(f.ad||0)>=35&&(f.ap||0)===0&&!profile.attack)return true;
 if(profile.damage==='physical'&&(f.ap||0)>=60&&(f.ad||0)===0)return true;
 return false;
}
export function buildFit(data,items,profile){
 const current=itemTotals(data,items),s=current.stats,b=profile.stats,weights={};
 if(profile.damage==='magic'||profile.kind==='hybrid')weights.ap=3;
 if(profile.damage==='physical'||profile.kind==='hybrid')weights.ad=3;
 if(profile.attack)weights.attackSpeed=profile.native?.fixedAttackRate?.7:1.4*Math.max(.65,Math.min(1.3,(profile.attackModel?.ratio||.65)/.65));
 if(profile.kind==='crit')weights.crit=1.8;
 if(profile.tank){weights.health=1.3;weights.armor=.7;weights.magicResist=.7;}
 if(profile.support)weights.haste=.9;else weights.haste=.45;
 if(profile.usesMana===true)weights.mana=.5;
 let penalty=0;const losses=[],uncertainStats=[];
 const labels={ap:'Yetenek gücü',ad:'Saldırı gücü',attackSpeed:'Saldırı hızı',crit:'Kritik ihtimali',haste:'Yetenek hızı',mana:'Mana',health:'Can',armor:'Zırh',magicResist:'Büyü direnci'};
 for(const [key,weight] of Object.entries(weights))if(b[key]>0){
  // A fully known set with no contributor has zero of this stat. An unknown
  // item or conflicting source is uncertainty and cannot erase the fit cost.
  if(current.uncertainStats.includes('*')||current.uncertainStats.includes(key)){penalty+=weight*.5;uncertainStats.push(labels[key]);continue;}
  const lost=Math.max(0,b[key]-(s[key]||0));penalty+=Math.min(1,lost/b[key])*weight;
  if(lost>0)losses.push({key,label:labels[key],value:Math.round(lost*10)/10});
 }
 // Missing values are uncertainty, never proof of zero cost or higher damage.
 if(current.unknown.length>profile.unknown.length)penalty+=.45;
 if(profile.usesMana===false&&(s.mana||0)>(b.mana||0))penalty+=.8;
 const warnings=uncertainStats.length?['Yeni sette '+uncertainStats.join(', ')+' toplamı doğrulanamadı; katkı kaybı kesin sayı olarak gösterilmiyor.']:[];
 if(current.scalingCrit>0){if(profile.kind==='crit')penalty+=.3;warnings.push('Birikimle kazanılacak kritik, yeni eşyanın hazır kritik niteliğine eklenmez; tamamlanma koşulu ayrı değerlendirilir.');}
 if(rulesUsable(data)){
  if(profile.native?.attackReset&&profile.spellblade&&!items.some(id=>itemFacts(data,id).mechanics.spellblade)){penalty+=.5;warnings.push('Kaynakta saldırı sıfırlama var; güçlendirilmiş saldırı düzeninin kaybı ek maliyet taşıyor.');}
  if(profile.native?.completedItemEvolution&&profile.champion?.id==='kaisa'&&profile.signature.some(id=>!items.includes(id))){penalty+=.5;warnings.push('Tam eşya ile yetenek gelişimi düzeni değişiyor; kaynak ana eşyalarını ve tamamlama zamanını koru.');}
  if(profile.ability?.forms.length>1&&!profile.ability.form)warnings.push('Şampiyonun biçimi kesinleşmedi; farklı biçimler kesin toplam hasara eklenmez. Kaynak seti ve olası biçimler ayrı değerlendirilir.');
  if(profile.spellblade&&!items.some(id=>['trinity-force','divine-sunderer','iceborn-gauntlet','lich-bane'].includes(id))){penalty+=1.5;warnings.push('Ana rehberin güçlendirilmiş saldırı eşyası kayboluyor.');}
  if(profile.onHit&&!items.some(id=>['guinsoos-rageblade','nashors-tooth','blade-of-the-ruined-king','kraken-slayer'].includes(id))){penalty+=1.5;warnings.push('Ana rehberin vuruş etkisi düzeni kayboluyor.');}
  if(profile.native?.fixedAttackRate&&items.some(id=>['guinsoos-rageblade','nashors-tooth','terminus'].includes(id))){penalty+=2;warnings.push('Sabit saldırı ritmi, çok sayıda saldırı gerektiren pasifleri daha yavaş çalıştırır.');}
  if(!['yasuo','yone'].includes(profile.champion?.id)&&(s.crit||0)+current.scalingCrit>100){penalty+=((s.crit||0)+current.scalingCrit-100)/25;warnings.push('Birikim tamamlandığında kritik ihtimali sınırını aşan yatırım var.');}
 }
 const model=attackModel(data,profile.champion,s,items);
 if(model.attackConflict)warnings.push('Resmî belgede bu şampiyonun saldırı hızı değerleri çelişiyor; kesin hız hesabı ve sınır cezası kullanılmıyor.');
 if(profile.attack&&model.capped&&!model.excessConversion){penalty+=Math.min(.8,(model.raw-model.speed)/model.cap);warnings.push('Referans aşamada saldırı hızı sınırını aşan yatırım var; fazlası ek saldırı olarak sayılmıyor.');}
 if(model.capped&&model.excessConversion)warnings.push('Kaynakta sınırı aşan saldırı hızı için saldırı gücü dönüşümü var; bu yatırım tamamen boşa sayılmıyor.');
 if(profile.attack&&profile.attackModel?.potential&&model.potential){const lost=Math.max(0,1-model.potential/profile.attackModel.potential);penalty+=Math.min(.7,lost);}
 return {penalty,losses,warnings,stats:s,scalingCrit:current.scalingCrit,unknown:current.unknown,label:penalty<.55?'Ana düzen korunuyor':penalty<1.2?'Ölçülü ödünleşim':'Belirgin eşya ödünleşimi'};
}

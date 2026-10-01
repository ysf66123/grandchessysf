import {traits,BOOT_UPGRADES} from './wild-rift-knowledge.mjs?v=20261001-combat3';
import {rulesUsable} from './wild-rift-item-rules.mjs?v=20261001-combat3';
import {termName} from './wild-rift-tr.mjs?v=20261001-combat3';
import {ageInDays} from './wild-rift-quality.mjs?v=20261001-combat3';
// These are guide suitability signals, not independent match statistics.
export function sourceConditionFit(guide,context,draft,profile){
 const conditions=guide.usageConditions||[],matched=[],unmatched=[];
 for(const condition of conditions){
  let count=0,label='';
  if(condition.key==='behind'){count=draft.ownState==='behind'?1:0;label='Geride oynama durumu';}
  if(condition.key==='burst'){count=context.rows.filter(r=>r.keys.burst>0).length;label='Birden fazla ani hasar tehdidi';}
  if(condition.key==='dive'){count=context.rows.filter(r=>{const t=traits({id:r.id});return t.engage||t.mobile&&t.burst;}).length;label='Birden fazla giriş veya dalış tehdidi';}
  if(condition.key==='resistance'){count=context.rows.filter(r=>profile.damage==='magic'?r.stats.magicResist>=30:profile.damage==='physical'?r.stats.armor>=40:r.stats.magicResist>=30||r.stats.armor>=40).length;label='Girilen eşyalarda birden fazla direnç yatırımı';}
  if(!label)continue;
  (count>=(condition.min||1)?matched:unmatched).push(label);
 }
 return {bonus:matched.length?Math.min(1.1,.65+matched.length*.15):conditions.length?-.55:0,matched,unmatched};
}
export function loadoutAdvice(base,context,draft){
 const advice=[],known=name=>termName(name)!=='Çevirisi beklenen seçim';
 // Only offer substitutions explicitly paired in the selected role's guide.
 for(const pair of base.runeAlternatives||[]){
  if(base.runes.indexOf(pair.from)!==4||!known(pair.from)||!known(pair.to))continue;
  let reason='',tradeoff='';
  if(pair.to==='Bone Plating'&&context.rows.some(r=>r.lane&&r.keys.burst)){reason='Koridor rakibinin kısa ani hasar takaslarına karşı kaynakta savunma alternatifi var.';tradeoff='Çıkardığın rünün hasar veya ölçeklenme katkısını bırakırsın.';}
  if(pair.to==='Second Wind'&&context.rows.some(r=>r.lane&&traits({id:r.id}).poke)){reason='Koridordaki tekrarlanan menzilli baskıya karşı kaynak alternatifi.';tradeoff='Ani hasarı engellemez; düzenli toparlanma içindir.';}
  if(pair.to==='Cut Down'&&context.rows.some(r=>r.stats.health>=700)){reason='Rakibin girilen eşyalarında yüksek can yatırımı var.';tradeoff='Düşük canlı hedefleri bitirme veya savunma katkısından vazgeçebilirsin.';}
  if(reason)advice.push({kind:'rune',from:pair.from,to:pair.to,reason,tradeoff,source:base.source});
 }
 const options=base.spellAlternatives||[];
 if(options.includes('Cleanse')&&known('Cleanse')&&context.rows.some(r=>r.lane&&r.keys.cc&&r.native?.abilityFacts?.some(a=>a.flags.cleanseableControl)))advice.push({kind:'spell',from:base.spells.find(s=>s!=='Flash'&&s!=='Smite')||null,to:'Cleanse',reason:'Koridor rakibinin kaynak panelinde arındırılabilir kontrol etkisi ve seçilen rehberde arındırma alternatifi var.',tradeoff:'Hasar veya savunma büyüsünün yerine değerlendirilir. Havaya savurma ve sindirme için çözüm olarak sunulmaz.',source:base.source});
 return advice;
}
export function bootUpgradeAdvice(data,result){
 if(!rulesUsable(data))return null;
 const parent=result.final.find(id=>BOOT_UPGRADES[id]);if(!parent)return null;
 const c=result.context,reason=parent==='mercurys-treads'&&c.pressure.magic>0?'Büyü hasarına karşı seçilen botun gelişim yolu.':parent==='plated-steelcaps'&&c.pressure.physical>0?'Fiziksel ve normal saldırı baskısına karşı seçilen botun gelişim yolu.':'Seçilen meta setindeki botun gelişim yolu.';
 const evidence=data.bootUpgrades,verified=evidence?.patch===data.latestPatch.version&&ageInDays(evidence.checkedAt)<=7&&evidence.byParent?.[parent];
 return {parent,name:BOOT_UPGRADES[parent],reason,unlockMinutes:10,source:'https://wildrift.leagueoflegends.com/tr-tr/news/game-updates/wild-rift-patch-notes-7-2/',verified:!!verified,id:verified?.id,cost:verified?.cost,fee:verified?.fee,stats:verified?.stats,basis:verified?'Riot yama zinciri '+evidence.reviewedPatches.join(' → ')+' kontrol edildi.':'Riot 7.2 ile gelen üçüncü aşama sistemi; fiyat doğrulanmayı bekliyor.',tradeoff:verified?'Aynı bot yuvasını kullanır. '+verified.fee+' altın yükseltme, ana eşyanın tamamlanmasını geciktirebilir.':'Ana eşyanın tamamlanmasını geciktirebilir; geliştirme fiyatı güncel pakette doğrulanmadığı için alışveriş hesabına eklenmez.'};
}

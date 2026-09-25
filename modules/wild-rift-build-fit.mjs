import {itemFacts,BOOTS,SUPPORT_ITEMS} from './wild-rift-item-rules.mjs?v=20260925-counters1';
import {traits} from './wild-rift-knowledge.mjs?v=20260925-counters1';
import {ageInDays} from './wild-rift-quality.mjs?v=20260925-counters1';
export function itemTotals(data,ids){
 const totals={},unknown=[];
 for(const id of ids){const f=itemFacts(data,id);if(!f.known||f.conflicts.length)unknown.push(id);for(const [k,n] of Object.entries(f.stats))if(Number.isFinite(n))totals[k]=(totals[k]||0)+n;}
 return {stats:totals,unknown};
}
export function combatFacts(data,champion,level){
 const f=champion?.combatFacts;
 if(!f||f.patch!==data.latestPatch.version||ageInDays(f.checkedAt)>7)return null;
 const stats={};if(Number.isInteger(level)&&level>=1&&level<=15)for(const [k,v] of Object.entries(f.stats))stats[k]=v.base+v.growth*(level-1);
 return {...f,level:level||null,atLevel:stats};
}
export function championProfile(data,champion,base){
 const total=itemTotals(data,base.final.filter(id=>!BOOTS.includes(id))),s=total.stats,t=traits(champion),combat=combatFacts(data,champion);
 const ap=s.ap||0,ad=s.ad||0,attack=(s.attackSpeed||0)>=35||(s.crit||0)>=40||base.core.some(id=>['blade-of-the-ruined-king','guinsoos-rageblade','nashors-tooth','kraken-slayer'].includes(id));
 const mixed=ap>=70&&ad>=50;
 const damage=mixed?'mixed':ap>ad*1.25&&ap>=70?'magic':ad>=50?'physical':t.magic?'magic':t.mixed?'mixed':t.attack?'physical':'unknown';
 const support=base.role==='support'&&base.final.some(id=>SUPPORT_ITEMS.includes(id));
 const tank=(s.armor||0)+(s.magicResist||0)>=100&&ad<110&&ap<140;
 const kind=support?(tank?'supportTank':'support'):tank?'tank':mixed?'hybrid':damage==='magic'?(attack?'onHitMage':'mage'):attack?((s.crit||0)>=50?'crit':'onHit'):'fighter';
 const labels={supportTank:'Ön saf desteği',support:'Takım desteği',tank:'Dayanıklı ön saf',hybrid:'Karma hasar',onHitMage:'Büyü ve normal saldırı',mage:'Yetenek hasarı',crit:'Kritik ve normal saldırı',onHit:'Sürekli normal saldırı',fighter:'Fiziksel yetenek / dövüşçü'};
 return {kind,label:labels[kind],damage,attack,support,tank,usesMana:combat?.usesMana??null,stats:s,unknown:total.unknown,champion};
}
export function application(data,id,profile,need){
 const facts=itemFacts(data,id),trigger=facts.mechanics[need==='heal'?'antiHeal':'antiShield'];
 if(!['heal','shield'].includes(need))return {factor:1,reason:''};
 if(!facts.effects[need==='heal'?'antiHeal':'antiShield'])return {factor:0,reason:'Güncel karşı etki doğrulanmadı.'};
 if(!trigger||trigger==='unknown')return {factor:.45,reason:'Etkinin uygulama koşulu tam doğrulanmadı; katkısı sınırlı sayıldı.'};
 if(trigger==='physicalDamage'&&profile.damage==='magic'&&!profile.attack)return {factor:.25,reason:'Etki fiziksel hasar istiyor; bu dizilim ağırlıklı büyü hasarı veriyor.'};
 if(trigger==='magicDamage'&&profile.damage==='physical')return {factor:.25,reason:'Etki büyü hasarı istiyor; bu dizilim ağırlıklı fiziksel hasar veriyor.'};
 return {factor:trigger==='damageOrIncomingAttack'&&!profile.tank?.85:1,reason:({physicalDamage:'Fiziksel hasar verdiğin hedefe uygulanır.',magicDamage:'Büyü hasarı verdiğin hedefe uygulanır.',abilityDamage:'Yetenek hasarı verdiğin hedefe uygulanır; alan ve tek hedef etkisi farklı olabilir.',damage:'Hasar verdiğin hedefe uygulanır; yakın ve uzak dövüş etkisi farklı olabilir.',damageOrIncomingAttack:'Hasar verdiğin veya normal saldırısını aldığın hedefe uygulanır.'})[trigger]||''};
}
export function incompatibleItem(data,id,profile){
 const f=itemFacts(data,id).stats;
 if(BOOTS.includes(id)||profile.tank||profile.support||profile.kind==='hybrid')return false;
 if(profile.damage==='magic'&&(f.ad||0)>=35&&(f.ap||0)===0&&!profile.attack)return true;
 if(profile.damage==='physical'&&(f.ap||0)>=60&&(f.ad||0)===0)return true;
 return false;
}
export function buildFit(data,items,profile){
 const current=itemTotals(data,items),s=current.stats,b=profile.stats,weights={};
 if(profile.damage==='magic'||profile.kind==='hybrid')weights.ap=3;
 if(profile.damage==='physical'||profile.kind==='hybrid')weights.ad=3;
 if(profile.attack)weights.attackSpeed=1.4;
 if(profile.kind==='crit')weights.crit=1.8;
 if(profile.tank){weights.health=1.3;weights.armor=.7;weights.magicResist=.7;}
 if(profile.support)weights.haste=.9;else weights.haste=.45;
 if(profile.usesMana===true)weights.mana=.5;
 let penalty=0;const losses=[];
 const labels={ap:'Yetenek gücü',ad:'Saldırı gücü',attackSpeed:'Saldırı hızı',crit:'Kritik ihtimali',haste:'Yetenek hızı',mana:'Mana',health:'Can',armor:'Zırh',magicResist:'Büyü direnci'};
 for(const [key,weight] of Object.entries(weights))if(b[key]>0&&Number.isFinite(s[key])){
  const lost=Math.max(0,b[key]-s[key]);penalty+=Math.min(1,lost/b[key])*weight;
  if(lost>0)losses.push({key,label:labels[key],value:Math.round(lost*10)/10});
 }
 // Missing values are uncertainty, never proof of zero cost or higher damage.
 if(current.unknown.length>profile.unknown.length)penalty+=.45;
 if(profile.usesMana===false&&(s.mana||0)>(b.mana||0))penalty+=.8;
 return {penalty,losses,stats:s,unknown:current.unknown,label:penalty<.55?'Ana düzen korunuyor':penalty<1.2?'Ölçülü ödünleşim':'Belirgin eşya ödünleşimi'};
}

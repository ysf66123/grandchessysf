import {itemFacts} from './wild-rift-item-rules.mjs?v=20261001-combat3';
import {ageInDays} from './wild-rift-quality.mjs?v=20261001-combat3';
export function attackModel(data,champion,stats,items=[],level=9){
 const rules=data.attackRules,native=champion?.combatFacts;
 if(!rules||rules.patch!==data.latestPatch.version||ageInDays(rules.checkedAt)>7||native?.patch!==data.latestPatch.version||ageInDays(native.checkedAt)>7)return {known:false};
 const original=rules.byChampion[champion.id];if(!original)return {known:false};
 const review=data.combatReview?.patch===data.latestPatch.version&&ageInDays(data.combatReview.checkedAt)<=7?data.combatReview.champions?.[champion.id]:null;
 const rule={...original};for(const r of review?.attack||[])if(Number.isFinite(r.current))rule[r.key]=r.current;
 const m=native.mechanics,itemSpeed=(stats.attackSpeed||0)/100,n=Math.max(0,Math.min(14,level-1)),growth=rules.levelGrowth;
 const attackConflict=!!rules.conflicts?.[champion.id],reviewMissing=data.patchImpact?.champions?.includes(champion.id)&&!review,attackKnown=!!growth&&!attackConflict&&!reviewMissing&&!m.fixedAttackRate,bonusGrowth=growth?rule.growth*(n*growth.constant+growth.increment*n*(n+1)/2):0;
 const raw=attackKnown?rule.base+rule.ratio*(rule.baseBonus+bonusGrowth+itemSpeed):null,cap=m.attackSpeedCap||rules.cap;
 const speed=attackKnown?m.attackSpeedCapException?raw:Math.min(cap,raw):null;
 const chance=(stats.crit||0)*(m.criticalChanceMultiplier||1),crit=Math.min(100,chance),overflowAD=Math.max(0,chance-100)*(m.criticalOverflowAD||0);
 const multiplier=Math.max(rules.baseCriticalMultiplier,...items.map(id=>itemFacts(data,id).mechanics.criticalMultiplier||0));
 const ordinary=!m.criticalMode;
 return {known:true,attackKnown,attackConflict,level,speed,raw,cap,ratio:rule.ratio,crit,overflowAD,multiplier,mode:m.criticalMode||'ordinary',fixed:!!m.fixedAttackRate,excessConversion:m.excessAttackSpeedConversion||null,capped:attackKnown&&!m.attackSpeedCapException&&raw>cap,potential:ordinary&&attackKnown?speed*(1+crit/100*(multiplier-1)):null,source:rules.source,patchReview:review?.url||null,basis:'Kaynak taban nitelikleri ve seviyeye bağlı büyüme ile eşya yatırımı; rün, geçici güçlendirme ve gerçek isabet oranı içermez.'};
}

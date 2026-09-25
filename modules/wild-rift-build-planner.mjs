import {traits,CONDITIONS} from './wild-rift-knowledge.mjs?v=20260925-counters2';
import {itemAvailability,finalItemAvailable,finalBuildAvailable} from './wild-rift-evidence.mjs?v=20260925-counters2';
import {guideQuality,championBuilds} from './wild-rift-quality.mjs?v=20260925-counters2';
import {ITEM_ROLES,itemFacts,itemConflicts,itemFamily,BOOTS,SUPPORT_ITEMS,NEED_LABELS,RULES_PATCH,TRANSFORM_FROM} from './wild-rift-item-rules.mjs?v=20260925-counters2';
import {championProfile,combatFacts,application,incompatibleItem,buildFit} from './wild-rift-build-fit.mjs?v=20260925-counters2';
const ENCHANTERS=new Set('janna karma lulu milio nami sona soraka yuumi'.split(' '));
const STRONG_HEAL=new Set('aatrox dr-mundo kayn soraka swain vladimir warwick yuumi'.split(' '));
const STRONG_SHIELD=new Set('janna karma lulu sett shen'.split(' '));
const FACTOR={heal:2.1,shield:2.3,magic:1.1,physical:1.1,cc:1.1,burst:1.5,tank:1.2,health:1.5,trueDamage:.5,attack:1.1,critical:2,armor:1.6,magicResist:1.9};
export function buildContext(data,draft,scenarios){
 const pressure=Object.fromEntries(Object.keys(NEED_LABELS).map(k=>[k,0])),rows=[],assignments=[];
 for(const [role,id] of Object.entries(draft.red)){
  const c=data.champions.find(c=>c.id===id);if(!c)continue;
  const t=traits(c),uncertain=(draft.uncertain||[]).includes(id),duo=['duo','support'].includes(draft.role);
  const lane=!uncertain&&(duo?['duo','support'].includes(role):draft.role!=='jungle'&&role===draft.role);
  const weight=(draft.phase==='lane'?(lane?2.1:.7):draft.phase==='team'?(lane?1.1:1):(lane?1.5:1))+(draft.fed===id?1.7:0);
  const keys={},gear=(draft.enemyItems?.[id]||[]).filter(i=>itemAvailability(data,i)),stats={armor:0,magicResist:0,crit:0,ad:0,ap:0,health:0,attackSpeed:0},effects={},unknown=[];
  for(const item of gear){const fact=itemFacts(data,item);for(const k of Object.keys(stats))stats[k]+=fact.stats[k]||0;Object.assign(effects,fact.effects);if(!fact.known||fact.conflicts.length)unknown.push(item);}
  const native=combatFacts(data,c,draft.enemyLevels?.[id]);
  const enemyGuide=c.builds.find(b=>b.role===role),enemyProfile=enemyGuide?championProfile(data,c,enemyGuide):null;
  const damage=enemyProfile?.damage||(t.magic?'magic':t.mixed?'mixed':t.attack?'physical':'unknown');
  const supportDamage=role==='support'&&ENCHANTERS.has(id)?.35:1;
  // Observed substantial AP/AD investment can qualify the usual damage profile.
  const magic=damage==='magic'?1:damage==='mixed'?.5:0,physical=damage==='physical'?1:damage==='mixed'?.5:0;
  keys.magic=Math.max(magic,stats.ap>=150?.75:0)*supportDamage;keys.physical=Math.max(physical,stats.ad>=100?.75:0)*supportDamage;
  for(const k of ['cc','burst','tank','attack'])keys[k]=t[k]?1:0;
  keys.attack=Math.max(keys.attack,Math.min(1.5,stats.attackSpeed/60));
  keys.health=Math.min(1.8,stats.health/700);keys.trueDamage=native?.trueDamage?1:0;
  keys.heal=Math.max(t.heal?(STRONG_HEAL.has(id)?1.4:1):0,effects.sustain?.8:0);
  keys.shield=Math.max(t.shield?(STRONG_SHIELD.has(id)?1.25:.75):0,effects.shield?.9:0);
  keys.critical=stats.crit>0?Math.min(1.5,stats.crit/25):0;
  keys.armor=Math.min(1.8,stats.armor/70+Math.max(0,(native?.atLevel.armor||0)-60)/130);
  keys.magicResist=Math.min(1.8,stats.magicResist/50+Math.max(0,(native?.atLevel.magicResist||0)-45)/80);
  const applied={};
  for(const assignment of draft.teamAssignments||[])if(assignment.target===id&&Object.values(draft.blue).includes(assignment.ally)&&assignment.ally!==draft.blue[draft.role]){
   const ally=data.champions.find(c=>c.id===assignment.ally),role=Object.keys(draft.blue).find(k=>draft.blue[k]===assignment.ally),guide=ally?.builds?.find(b=>b.role===role);
   if(!guide||!itemAvailability(data,assignment.item))continue;
   const profile=championProfile(data,ally,guide);
   for(const need of ['heal','shield']){const a=application(data,assignment.item,profile,need);if(a.factor>=.75){applied[need]=Math.max(applied[need]||0,.4*a.factor);assignments.push({...assignment,need,allyName:ally.name,targetName:c.name});}}
  }
  for(const need of ['heal','shield'])keys[need]*=1-(applied[need]||0);
  for(const k of Object.keys(pressure))pressure[k]+=keys[k]*weight;
  rows.push({id,name:c.name,role,lane,uncertain,fed:draft.fed===id,weight,keys,gear,stats,native,unknown,damage,inventoryKnown:gear.length>0});
 }
 const coverage=draft.teamCoverage||{};
 for(const k of ['heal','shield'])if(coverage[k]&&!assignments.some(a=>a.need===k))pressure[k]*=.9;
 const priorities=Object.keys(pressure).map(key=>({key,label:NEED_LABELS[key],value:pressure[key],targets:rows.filter(r=>r.keys[key]>0).sort((a,b)=>b.keys[key]*b.weight-a.keys[key]*a.weight).map(r=>r.name)})).filter(p=>p.value>.5).sort((a,b)=>b.value*FACTOR[b.key]-a.value*FACTOR[a.key]);
 return {pressure,rows,priorities,assignments,phase:draft.phase||'draft',uncertain:scenarios.uncertain,valid:scenarios.valid,missing:5-rows.length,unknownInventories:rows.filter(r=>!r.inventoryKnown).length};
}
function cover(id,data,profile){
 const result={...(data.latestPatch.version===RULES_PATCH?ITEM_ROLES[id]?.covers||{}:{})},facts=itemFacts(data,id);
 if(!finalItemAvailable(data,id))return {};
 delete result.heal;delete result.shield;
 if(facts.effects.antiHeal)result.heal=application(data,id,profile,'heal').factor;
 if(facts.effects.antiShield)result.shield=application(data,id,profile,'shield').factor;
 if(facts.mechanics.healthDamage)result.health=facts.mechanics.onHit&&!profile.attack?.45:1;
 return result;
}
function coverage(items,data,profile){
 const sums={};for(const id of items)for(const [key,value] of Object.entries(cover(id,data,profile)))sums[key]=(sums[key]||0)+value;
 return Object.fromEntries(Object.entries(sums).map(([k,v])=>[k,Math.min(1.3,v)]));
}
function conditionKey(condition,to){
 const key=CONDITIONS[condition]?.key;
 if(key==='tank'&&['void-staff','bloodletters-curse'].includes(to))return 'magicResist';
 return key;
}
export function planBuild(data,draft,champion,base,scenarios){
 const quality=guideQuality(data,champion,draft.role,Date.now(),base.guideId),current=quality.usable,rulesCurrent=data.latestPatch.version===RULES_PATCH;
 const context=buildContext(data,draft,scenarios),profile=championProfile(data,champion,base),p=context.pressure,protectedCore=new Set(base.core.slice(0,2).map(itemFamily)),alternatives=[],rejected=[];
 const maxChanges=draft.adaptation==='extended'?3:2;
 const boot=base.final.find(id=>BOOTS.includes(id));
 function add(from,to,condition,kind='guide',source=base.source){
  const rule=CONDITIONS[condition];if(!rule||!base.final.includes(from)||!finalItemAvailable(data,to)||from===to)return;
  const key=conditionKey(condition,to),priority=key==='manual'?0:p[key]||0;
  if(alternatives.some(a=>a.from===from&&a.to===to))return;
  const targets=context.rows.filter(r=>(r.keys[key]||0)>0).sort((a,b)=>b.keys[key]*b.weight-a.keys[key]*a.weight).map(r=>r.name);
  const loss=ITEM_ROLES[from]?.loss||'Kaynak dizilimin bu eşyayla sağladığı hasar veya takım katkısı değişir.';
  const delivery=application(data,to,profile,key);
  const blocking=protectedCore.has(itemFamily(from))?'İlk iki ana eşya korunuyor.':SUPPORT_ITEMS.includes(from)?'Destek gelir eşyası korunuyor.':draft.locked.includes(from)?'Satın alınmış eşya korunuyor.':!current?'Rehberin yaması veya tarihi güncel değil.':!rulesCurrent?'Bu yamada eşya etkileşimleri yeniden doğrulanmalı.':incompatibleItem(data,to,profile)?'Bu şampiyonun seçili hasar düzenine uygun değil.':['heal','shield'].includes(key)&&delivery.factor<.75?'Karşı etkiyi güvenilir uygulama koşulu sağlanmıyor.':key==='manual'?'Bu seçenek yalnızca elle uygulanır.':priority<1.45?'Tehdit henüz yeterince belirgin değil.':null;
  alternatives.push({from,to,key,condition,label:rule.label,priority,targets,tradeoff:loss,kind,source,blocking,application:delivery.reason});
 }
 for(const s of base.situational)if(s.items?.length===2)add(s.items[0],s.items[1],s.condition);
 const sourceGuides=championBuilds(champion).filter(b=>b.role===draft.role&&b.guideId!==base.guideId&&guideQuality(data,champion,b.role,Date.now(),b.guideId).usable&&finalBuildAvailable(data,b.final));
 // Reuse explicit situational pairs only when their original item exists in
 // this full build. Whole alternative cores remain separate user choices.
 for(const guide of sourceGuides)for(const s of guide.situational||[])if(s.items?.length===2&&base.final.includes(s.items[0]))add(s.items[0],s.items[1],s.condition,'source',guide.source);
 for(const guide of sourceGuides){
  const out=base.final.filter(id=>!guide.final.includes(id)),into=guide.final.filter(id=>!base.final.includes(id));
  if(out.length!==1||into.length!==1)continue;
  const key=Object.entries(cover(into[0],data,profile)).filter(([key,value])=>value>=.7&&key!=='trueDamage').sort((a,b)=>(p[b[0]]||0)-(p[a[0]]||0))[0]?.[0];
  const condition=Object.keys(CONDITIONS).find(c=>CONDITIONS[c].key===key);if(condition)add(out[0],into[0],condition,'source',guide.source);
 }
 // Defensive boots are the only universal alternatives; damage items stay guide-specific.
 if(boot){add(boot,'mercurys-treads','vs Magic Damage','boots');add(boot,'plated-steelcaps','vs Physical Damage','boots');}
 for(const a of alternatives)if(a.kind==='boots'){
  const dominant=a.to==='mercurys-treads'?p.magic>=2.8&&p.magic>=p.physical*.85:p.physical>=2.8&&p.attack>=1.8&&p.physical>=p.magic*.85;
  if(!dominant&&!a.blocking)a.blocking='Savunma botu için hasar dağılımı yeterince belirgin değil.';
 }
 const initial=[...base.final],fixed=new Set(),fixedChanges=[],unplaced=[];
 const purchased=[...new Set([...draft.locked,...(draft.owned||[]).filter(id=>finalItemAvailable(data,id))].map(id=>rulesCurrent?base.final.find(f=>TRANSFORM_FROM[f]===id)||id:id))];
 const inventoryConflict=purchased.filter(id=>!base.final.includes(id)&&!alternatives.some(a=>a.to===id));
 if(inventoryConflict.length)return {champion,base,missing:true,inventoryConflict};
 for(const id of purchased){
  if(initial.includes(id)){fixed.add(initial.indexOf(id));continue;}
  const a=alternatives.find(a=>a.to===id&&!fixed.has(base.final.indexOf(a.from))&&!protectedCore.has(itemFamily(a.from))&&!itemConflicts(initial.filter(i=>i!==a.from),id));
  if(a){const slot=base.final.indexOf(a.from);initial[slot]=id;fixed.add(slot);fixedChanges.push({...a,label:'Satın aldığın eşya korunuyor',mode:'purchased'});}
  else unplaced.push(id);
 }
 if(unplaced.length)return {champion,base,missing:true,inventoryConflict:unplaced};
 for(const [from,to] of Object.entries(draft.overrides||{})){
  const slot=base.final.indexOf(from),a=alternatives.find(a=>a.from===from&&a.to===to);
  if(!current||!rulesCurrent||!a||slot<0||fixed.has(slot)||incompatibleItem(data,to,profile)||protectedCore.has(itemFamily(from))||SUPPORT_ITEMS.includes(from)||itemConflicts(initial.filter((_,i)=>i!==slot),to)){rejected.push('Elle seçim; kaynak, ana eşya, satın alma veya eşya çakışması nedeniyle uygulanmadı.');continue;}
  initial[slot]=to;fixed.add(slot);fixedChanges.push({...a,label:'Elle seçtiğin kaynak alternatifi',mode:'manual'});
 }
 const initialCover=coverage(initial,data,profile),baseUtility=utility(initial),candidates=[];
 function utility(items){const cov=coverage(items,data,profile);return Object.entries(p).reduce((sum,[key,value])=>{
  const defensive=['magic','physical','cc','burst','critical','attack'].includes(key),mode=draft.buildPriority==='survive'?(defensive?1.35:.85):draft.buildPriority==='damage'?(defensive?.75:1.1):1;
  const state=draft.ownState==='behind'&&defensive?1.15:draft.ownState==='ahead'&&key==='burst'?1.1:1;
  return sum+value*(cov[key]||0)*FACTOR[key]*mode*state;
 },0)-buildFit(data,items,profile).penalty*(draft.buildPriority==='damage'?1.5:1);}
 // Enumerate bounded combinations instead of greedily taking the first same-slot swap.
 function search(slot,items,chosen){
  if(slot===initial.length){
   const automaticPenalty=chosen.reduce((n,a)=>n+1.05+(base.core.includes(a.from)?.65:0)+(draft.buildPriority==='damage'&&a.kind==='boots'?.8:0),0);
   const score=utility(items)-baseUtility-automaticPenalty;
   candidates.push({final:items,changes:chosen,score});return;
  }
  search(slot+1,items,chosen);
  if(!current||!rulesCurrent||fixed.has(slot)||chosen.length>=maxChanges)return;
  for(const a of alternatives.filter(a=>a.from===base.final[slot]&&!a.blocking)){
   if(itemConflicts(items.filter((_,i)=>i!==slot),a.to))continue;
   const next=[...items];next[slot]=a.to;search(slot+1,next,[...chosen,{...a,mode:'automatic'}]);
  }
 }
 search(0,initial,[]);
 candidates.sort((a,b)=>b.score-a.score||a.changes.length-b.changes.length||a.final.join().localeCompare(b.final.join()));
 const best=candidates[0],final=best.final,changes=[...fixedChanges,...best.changes];
 for(const a of alternatives){
  a.selected=changes.some(c=>c.from===a.from&&c.to===a.to);a.gain=0;
  if(!a.blocking){const slot=base.final.indexOf(a.from);const other=[...initial];other[slot]=a.to;if(!itemConflicts(initial.filter((_,i)=>i!==slot),a.to))a.gain=utility(other)-baseUtility-1.05;}
  if(!a.selected&&!a.blocking)a.blocking=a.gain<=0?'Vazgeçilen eşyanın katkısı bu maçta daha değerli.':'Aynı yuva veya değişiklik sınırı nedeniyle daha yararlı birleşim seçildi.';
 }
 const cov=coverage(final,data,profile),unmet=context.priorities.filter(n=>n.value>=2.5&&(cov[n.key]||0)<.65).map(n=>({...n,reason:n.key==='trueDamage'?'Zırh veya büyü direnci bu hasarı doğrudan çözmez; yetenekten kaçınma ve doğru savunma zamanlaması gerekir.':'Kaynak havuzunda ana düzeni bozmadan uygulanabilen ek seçenek yok; bunu otomatik olarak çözülmüş saymıyoruz.'}));
 const unchanged=base.final.filter((id,i)=>id===final[i]).length;
 const gap=candidates.length>1?best.score-candidates[1].score:Infinity;
 const limited=!current||!rulesCurrent||!context.valid||context.uncertain||context.missing>0||context.unknownInventories>0||profile.unknown.length>0||context.rows.some(r=>r.unknown.length||r.damage==='unknown');
 const confidence=limited?'limited':gap<.65?'close':'clear';
 return {champion,base,final,changes,alternatives:alternatives.sort((a,b)=>Number(b.selected)-Number(a.selected)||b.priority-a.priority),current,quality,rejected,missing:false,context,unmet,profile,fit:buildFit(data,final,profile),rulesCurrent,maxChanges,
  confidence:{level:confidence,label:confidence==='limited'?'Eksik bilgiyle sınırlı öneri':confidence==='close'?'Birbirine yakın seçenekler':'Kurallar içinde belirgin tercih',gap:Number.isFinite(gap)?Math.round(gap*100)/100:null},
  sourceOptions:sourceGuides.map(b=>({guideId:b.guideId,label:b.label||'Kaynak dizilimi',source:b.source,region:b.region||'global',final:b.final,coreChange:base.core.slice(0,2).some(id=>!b.final.includes(id)),reason:b.variantType==='anti-ad'&&p.physical>p.magic?'Fiziksel baskıya yönelik kaynak seçeneği.':b.variantType==='anti-ap'&&p.magic>p.physical?'Büyü baskısına yönelik kaynak seçeneği.':b.variantType==='anti-tank'&&p.tank>=2?'Ön saflara yönelik kaynak seçeneği.':'Farklı bir kaynak düzeni; tüm dizilim olarak karşılaştır.'})),
  comparison:{unchanged,automatic:best.changes.length,evaluated:candidates.length,baseline:base.final,coverageBefore:initialCover,coverageAfter:cov},
  nearby:candidates.filter(c=>c!==best&&best.score-c.score<.65).slice(0,2),
  notes:[...(!rulesCurrent?['Yeni yamada etkileşim kuralları doğrulanana kadar otomatik değişiklikler durduruldu.']:[]),...(!context.rows.length?['Rakip seçilmediği için kaynak meta dizilimi korunuyor.']:[]),...(context.uncertain?['Belirsiz koridorlara kesin koridor ağırlığı verilmedi.']:[]),...(context.unknownInventories?['Eşyaları girilmeyen rakiplerin alışverişi bilinmiyor. Bu alanlar sıfır yatırım anlamına gelmez.']:[]),...(draft.teamCoverage?.heal||draft.teamCoverage?.shield?['Hedefi belirtilmeyen takım karşı eşyası yalnızca küçük bir öncelik indirimi sağlar.']:[])]};
}

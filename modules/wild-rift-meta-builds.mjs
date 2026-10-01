import {sourceConditionFit,loadoutAdvice,bootUpgradeAdvice} from './wild-rift-loadout.mjs?v=20261001-combat3';
import {championBuilds,guideQuality} from './wild-rift-quality.mjs?v=20261001-combat3';
import {finalBuildAvailable} from './wild-rift-evidence.mjs?v=20261001-combat3';
import {planBuild,buildContext,coverage,contextUtility,robustAssessment} from './wild-rift-build-planner.mjs?v=20261001-combat3';
import {decisionConditions} from './wild-rift-decision-conditions.mjs?v=20261001-combat3';
import {championProfile,buildFit,itemTotals} from './wild-rift-build-fit.mjs?v=20261001-combat3';
import {rulesUsable,BOOTS,SUPPORT_ITEMS} from './wild-rift-item-rules.mjs?v=20261001-combat3';
import {completionCost,itemCost} from './wild-rift-purchase.mjs?v=20261001-combat3';
import {traits} from './wild-rift-knowledge.mjs?v=20261001-combat3';

// Compare complete, attributed templates against one stable champion/role
// reference. A candidate must not grade its own lost damage as zero.
export function selectMetaBuild(data,draft,champion,reference,scenarios,previous=null){
 const fallback=()=>planBuild(data,draft,champion,reference,scenarios);
 if(!rulesUsable(data))return fallback();
 const primary=champion.builds.find(b=>b.role===draft.role&&guideQuality(data,champion,b.role,Date.now(),b.guideId).usable&&finalBuildAvailable(data,b.final))||reference;
 const profile=championProfile(data,champion,primary),seen=new Set(),evaluated=[],excluded=[],native=traits(champion),context=buildContext(data,draft,scenarios);
 const guides=championBuilds(champion).filter(b=>b.role===draft.role&&guideQuality(data,champion,b.role,Date.now(),b.guideId).usable&&finalBuildAvailable(data,b.final));
 for(const guide of guides.slice(0,16)){
  const identity=[...guide.final].sort().join('|')+'|'+(guide.usageConditions||[]).map(c=>c.key).join(',');if(seen.has(identity)&&guide.guideId!==draft.variant)continue;seen.add(identity);
  const candidateProfile=championProfile(data,champion,guide),fit=buildFit(data,guide.final,profile);
  // Explicitly pinned role builds may choose another play style. Automatic
  // selection cannot turn an AP mage into an AD carry or a support into a carry.
  const nativeAlternative=native.mixed||native.tank;
  const wrongStyle=profile.support!==candidateProfile.support||(!nativeAlternative&&profile.tank!==candidateProfile.tank)||
   (!nativeAlternative&&profile.damage!==candidateProfile.damage&&profile.damage!=='mixed'&&candidateProfile.damage!=='mixed')||
   (!nativeAlternative&&profile.kind==='crit'&&(candidateProfile.stats.crit||0)+candidateProfile.scalingCrit<((profile.stats.crit||0)+profile.scalingCrit)*.6)||
   (profile.kind==='onHit'&&!candidateProfile.attack);
  if(wrongStyle&&guide.guideId!==draft.variant){excluded.push({guideId:guide.guideId,reason:'Şampiyonun bu roldeki hasar veya takım görevi değişiyor.'});continue;}
  const r=planBuild(data,draft,champion,guide,scenarios,context,previous);
  if(r.missing){excluded.push({guideId:guide.guideId,reason:'Satın aldığın eşyalar bu kaynak setine yerleştirilemiyor.'});continue;}
  const styleChanged=candidateProfile.style!==profile.style;
  // An attributed alternative native play style has its own stat goals. Charge
  // an explicit transition cost instead of judging a tank solely by lost AP.
  const fitProfile=nativeAlternative&&styleChanged?candidateProfile:profile;
  const finalFit=buildFit(data,r.final,fitProfile),changed=primary.final.filter(id=>!r.final.includes(id)&&!BOOTS.includes(id)).length;
  const cov=r.comparison.coverageAfter,pressure=r.context.pressure;
  const metaPenalty=(guide.sourceId==='wildriftcore'?.65:0)+(r.quality.normalized?.65:0)+(r.quality.reviewed?.25:0)+(r.quality.editorialBeforePatch?.65:0);
  const allies=Object.entries(draft.blue).filter(([,id])=>id!==champion.id).map(([role,id])=>{const c=data.champions.find(c=>c.id===id),b=c?.builds.find(b=>b.role===role);return b?championProfile(data,c,b):null;}).filter(Boolean);
  const supportBonus=profile.support&&['janna','karma','lulu','milio','nami','senna','sona','soraka','yuumi'].includes(champion.id)&&r.final.includes('ardent-censer')&&allies.some(p=>p.attack)?.5:0;
  let parts=[...(draft.owned||[])],credited=0;
  for(const id of r.final){const detail=completionCost(data,id,parts);if(!detail.exact)continue;credited+=detail.used.reduce((sum,i)=>sum+(itemCost(data,parts[i])||0),0);parts=parts.filter((_,i)=>!detail.used.includes(i));}
  const investmentBonus=Math.min(.8,credited/1500);
  const defensiveItems=r.final.filter(id=>{const v=coverage([id],data,candidateProfile,r.context);return (v.magic||0)+(v.physical||0)+(v.burst||0)>=.6;}).length;
  const overDefense=!candidateProfile.tank&&!candidateProfile.support&&defensiveItems>2?(defensiveItems-2)*1.4:0;
  const sourceFit=sourceConditionFit(guide,r.context,draft,candidateProfile);
  const robust=robustAssessment(r.context,cov,draft);
  const utility=sourceFit.bonus+robust.score*.75+r.stageEvaluation.score*.25+supportBonus+investmentBonus-finalFit.penalty*1.8-changed*.7-metaPenalty-r.comparison.automatic*.35-overDefense-(nativeAlternative&&styleChanged?1.25:0);
  const benefits=r.context.priorities.filter(n=>(cov[n.key]||0)>.5).slice(0,3).map(n=>({label:n.label,targets:n.targets}));
  evaluated.push({result:r,sourceFit,score:utility,guideId:guide.guideId,final:r.final,baseFinal:guide.final,label:guide.label||'Ana meta rehberi',source:guide.source,sourceId:guide.sourceId||'wildriftfire',patch:guide.patch,reviewed:r.quality.reviewed,benefits,tradeoff:finalFit.label,losses:finalFit.losses,style:candidateProfile.label,styleChanged,coreChanged:primary.core.slice(0,2).some(id=>!guide.final.includes(id))});
 }
 if(!evaluated.length)return fallback();
 evaluated.sort((a,b)=>b.score-a.score||Number(a.guideId!==primary.guideId)-Number(b.guideId!==primary.guideId)||a.guideId.localeCompare(b.guideId));
 let winner=draft.variant?evaluated.find(c=>c.guideId===draft.variant):evaluated[0];
 if(!winner)return fallback(); // Never override an explicit user choice.
 // Small differences are uncertain. Preserve the primary template if its
 // inventory is feasible, preventing needless switching on marginal signals.
 const primaryCandidate=evaluated.find(c=>c.guideId===primary.guideId);
 if(!draft.variant&&primaryCandidate&&winner.score-primaryCandidate.score<.8)winner=primaryCandidate;
 const priorCandidate=!draft.variant&&previous?evaluated.find(c=>c.guideId===previous.guideId&&c.final.join()===previous.final?.join()):null;
 if(priorCandidate&&winner.score-priorCandidate.score<.8){winner=priorCandidate;winner.result.continuity={...winner.result.continuity,retained:true,reason:'Önceki geçerli set, kaynaklar arasındaki küçük puan farkında korundu.'};}
 winner.result.bootUpgrade=bootUpgradeAdvice(data,winner.result);
 winner.result.loadoutAdvice=loadoutAdvice(winner.result.base,winner.result.context,draft);
 const alternatives=evaluated.filter(c=>c!==winner&&[...c.final].sort().join()!==[...winner.final].sort().join()).slice(0,2),result=winner.result;
 result.itemDecisions=result.final.map((id,i)=>{
  const cov=coverage([id],data,result.profile,result.context),needs=result.context.priorities.filter(n=>(cov[n.key]||0)>.25).slice(0,2),change=result.changes.find(c=>c.to===id);
  return {id,targets:[...new Set(needs.flatMap(n=>n.targets))],needs:needs.map(n=>n.label),basis:change?'Maça özel kaynak alternatifi':result.base.core.includes(id)?'Kaynağın ana eşya düzeni':BOOTS.includes(id)?'Hareket ve bot nitelikleri':'Tam kaynak diziliminin parçası',tradeoff:change?.tradeoff||null,source:change?.source||result.base.source,slot:i+1};
 });
 result.metaSelection={mode:draft.variant?'manual':'automatic',evaluated:evaluated.length,excluded:excluded.length,selected:describe(winner),alternatives:alternatives.map(describe),reference:primary.final,
  reason:draft.variant?'Seçtiğin kaynak seti korunarak rakiplere uyarlandı.':winner.guideId===primary.guideId?'Ana meta seti, rakip ihtiyaçları ve vazgeçilen eşya katkısı birlikte değerlendirilince korundu.':'Güncel kaynak setleri karşılaştırıldı; bu set koridor ve takım ihtiyaçlarına daha uygun bulundu.',
  basis:'Bu sıralama kaynak rehberleri ve açıklanabilir eşya kurallarıdır; ölçülmüş kazanma oranı veya hasar simülasyonu değildir.'};
 if(alternatives.length&&Math.abs(winner.score-alternatives[0].score)<.8&&result.confidence.level!=='limited')result.confidence={...result.confidence,level:'close',label:'Tam setler arasında yakın tercih'};
 result.decisionConditions=decisionConditions(result,draft);
 return result;
}
function describe(c){const {result,score,...publicData}=c;return publicData;}

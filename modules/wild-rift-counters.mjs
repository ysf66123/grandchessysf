import {relationshipEvidence} from './wild-rift-evidence.mjs?v=20260925-counters2';
import {ageInDays} from './wild-rift-quality.mjs?v=20260925-counters2';
import {traits} from './wild-rift-knowledge.mjs?v=20260925-counters2';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
// Recommendation weights, not measured probabilities or combat simulation.
export function evaluateMatchup(data,candidate,enemy,role,now=Date.now()){
 if(!enemy||!candidate.roles.includes(role)||!enemy.roles.includes(role))return {enemy,value:0,known:false,conflict:false,sources:[],status:'missing',families:0};
 const positive=relationshipEvidence(data,enemy.id,candidate.id,role,'counter',now),negative=relationshipEvidence(data,candidate.id,enemy.id,role,'counter',now);
 const skill=[...relationshipEvidence(data,candidate.id,enemy.id,role,'skill',now),...relationshipEvidence(data,enemy.id,candidate.id,role,'skill',now)];
 const groups=new Map(),sources=[];
 for(const [rows,sign] of [[positive,1],[negative,-1],[skill,0]])for(const row of rows){
  const family=row.family||row.source,weight=({hard:1.2,moderate:1,unspecified:.85})[row.strength]||.85;
  // An old editorial date is not refreshed by fetching the page again.
  const freshness=ageInDays(row.checkedAt,now)>3?.85:1,editorial=row.updatedAt&&ageInDays(row.updatedAt,now)>30?.65:1;
  const v=sign*weight*freshness*editorial;
  if(!groups.has(family))groups.set(family,[]);groups.get(family).push(v);sources.push({...row,direction:sign});
 }
 const votes=[...groups.values()].map(v=>v.some(n=>n>0)&&v.some(n=>n<0)?0:v.reduce((a,b)=>Math.abs(b)>Math.abs(a)?b:a,0));
 const conflict=positive.length>0&&negative.length>0;
 const sum=votes.reduce((a,b)=>a+b,0),net=sum/Math.max(1,votes.length);
 const value=Math.round(clamp(net*(votes.length>=2?27:21),conflict?-10:-32,conflict?10:32));
 const status=conflict?'conflict':positive.length?'advantage':negative.length?'disadvantage':skill.length?'skill':'missing';
 return {enemy,value,known:sources.length>0,conflict,sources,families:groups.size,status,agreement:!conflict&&!skill.length&&votes.filter(v=>v!==0).length>=2};
}
export function mechanicalContext(data,candidate,enemies){
 if(data.latestPatch.version!=='7.3')return {score:0,reasons:[],risks:['Bu yamada mekanik kurallar yeniden doğrulanmalı; mekanik katkı kapalı.'],phases:[]};
 const t=traits(candidate),reasons=[],risks=[],phases=[];let score=0;
 if(enemies.some(e=>traits(e).poke)&&!t.mobile&&!t.heal&&!t.shield){score-=2;risks.push('Mekanik çıkarım: menzilli baskıya karşı kaçış ve can koruma seçeneklerin sınırlı olabilir.');}
 if(t.peel&&enemies.some(e=>traits(e).engage)){score+=2;reasons.push('Mekanik çıkarım: rakibin girişine karşı koruma araçları sunar; zamanlama gerekir.');}
 if(t.scaling){phases.push('Erken: gelir ve deneyimi koru.','Orta/geç: ana eşyalardan sonra sürekli hasar penceresi ara.');if(enemies.some(e=>traits(e).burst)){score-=3;risks.push('Erken ani hasar baskısı, güçlenme süreni geciktirebilir.');}}
 else phases.push('Erken: önemli rakip yeteneği boşa çıktığında takası değerlendir.','Orta/geç: koridor üstünlüğünü görüş ve objektife taşı.');
 return {score:clamp(score,-5,3),reasons,risks,phases};
}
export function duoContext(data,draft,candidate,byId){
 if(!['duo','support'].includes(draft.role))return {active:false,score:0,complete:true,reasons:[],risks:[]};
 const other=draft.role==='duo'?'support':'duo',partner=byId.get(draft.blue[other]),red=['duo','support'].map(r=>byId.get(draft.red[r])).filter(Boolean);
 const complete=!!partner&&red.length===2&&!red.some(c=>(draft.uncertain||[]).includes(c.id));
 const reasons=[],risks=[];let score=0;
 if(!complete)return {active:true,score:0,complete:false,reasons,risks:['İkiye iki koridor için partner ve iki rakibin kesin rolleri gerekli.']};
 const t=traits(candidate),p=traits(partner),opponents=red.map(traits);
 const synergy=[...relationshipEvidence(data,candidate.id,partner.id,draft.role,'synergy'),...relationshipEvidence(data,partner.id,candidate.id,other,'synergy')];
 if(synergy.length){score+=4;reasons.push(`${partner.name} ile kaynakta uyum var; bu, rakip ikiliye karşı ölçülmüş oran değildir.`);}
 if(data.latestPatch.version==='7.3'){
  if(t.peel&&p.scaling&&opponents.some(e=>e.engage||e.burst)){score+=4;reasons.push(`${partner.name} güçlenirken rakip ikilinin girişine karşı koruma sağlar.`);}
  if(t.engage&&p.poke&&opponents.some(e=>e.engage)){score-=2;risks.push('Partnerin uzaktan baskı isterken giriş yapmak onu rakibin karşı girişine açık bırakabilir.');}
  if(opponents.some(e=>e.poke)&&!t.heal&&!p.heal&&!t.shield&&!p.shield&&!t.mobile){score-=3;risks.push('Bu ikili menzilli baskıda can korumakta zorlanabilir.');}
 }
 // Partner's actual matchup affects the pair, not just our isolated matchup.
 const partnerMatchup=evaluateMatchup(data,partner,byId.get(draft.red[other]),other);
 if(partnerMatchup.known){score+=clamp(Math.round(partnerMatchup.value/6),-4,4);if(partnerMatchup.value<0)risks.push(`${partner.name} için karşı taraftaki ${partnerMatchup.enemy.name} kaynaklarda zor eşleşme.`);}
 return {active:true,score:clamp(score,-8,8),complete,reasons,risks,partnerMatchup,sources:synergy};
}

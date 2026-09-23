import {ageInDays,guideQuality} from './wild-rift-quality.mjs?v=20260923-wr3';
const cache=new WeakMap();
function index(data){
 if(cache.has(data))return cache.get(data);
 const items=new Map(),relations=new Map();
 for(const row of data.evidence?.items||[]){if(!items.has(row.id))items.set(row.id,[]);items.get(row.id).push(row);}
 for(const row of data.evidence?.relationships||[]){const key=row.subject+':'+row.opponent+':'+row.role;if(!relations.has(key))relations.set(key,[]);relations.get(key).push(row);}
 const result={items,relations};cache.set(data,result);return result;
}
export function itemAvailability(data,id){const item=data.items[id];return !!item&&!(item.removedIn&&compareVersion(item.removedIn,data.latestPatch.version)<=0);}
function compareVersion(a,b){const parts=x=>String(x).match(/^(\d+)\.(\d+)([a-z]?)$/)?.slice(1);const x=parts(a),y=parts(b);if(!x||!y)return 1;return +x[0]-+y[0]||+x[1]-+y[1]||x[2].localeCompare(y[2]);}
export function priceEvidence(data,id,now=Date.now()){
 const item=data.items[id];if(!item)return {cost:null,status:'missing',observations:[]};
 const observations=[...(index(data).items.get(id)||[])];
 if(item.costSource?.includes('wildriftfire.com')&&!observations.some(o=>o.source==='wildriftfire'))observations.unshift({source:'wildriftfire',cost:item.cost,patch:item.costPatch,checkedAt:item.costCheckedAt,url:item.costSource});
 const current=observations.filter(o=>o.patch===data.latestPatch.version&&ageInDays(o.checkedAt,now)<=7&&Number.isFinite(o.cost));
 const official=item.official;
 if(!itemAvailability(data,id))return {cost:null,status:'removed',observations};
 if(official?.patch===data.latestPatch.version&&ageInDays(official.checkedAt,now)<=7&&Number.isInteger(official.cost))return {cost:official.cost,status:'official',observations,conflict:current.some(o=>o.cost!==official.cost),source:official.url};
 if(new Set(current.map(o=>o.cost)).size>1)return {cost:null,status:'conflict',observations};
 const valid=Number.isInteger(item.cost)&&item.cost>=100&&item.cost<=10000&&item.costPatch===data.latestPatch.version&&ageInDays(item.costCheckedAt,now)<=7;
 if(valid&&current.some(o=>o.cost!==item.cost))return {cost:null,status:'conflict',observations};
 return {cost:valid?item.cost:current[0]?.cost??null,status:current.length>=2?'agreement':valid?'single':'missing',observations};
}
export function relationshipEvidence(data,subject,opponent,role,kind='counter',now=Date.now()){
 const rows=(index(data).relations.get(subject+':'+opponent+':'+role)||[]).filter(r=>r.kind===kind&&r.patch===data.latestPatch.version&&ageInDays(r.checkedAt,now)<=7);
 const c=data.champions.find(c=>c.id===subject),guide=c?.builds?.find(b=>b.role===role);
 if(guide&&guideQuality(data,c,role,now).usable&&(kind==='counter'?guide.counters:guide.synergies).includes(opponent))rows.unshift({source:'wildriftfire',patch:guide.patch,url:guide.source,checkedAt:c.fetchedAt});
 return [...new Map(rows.map(r=>[r.source,r])).values()];
}
export function statisticUsable(data,row,rank,role,now=Date.now()){
 return row?.patch===data.latestPatch.version&&row.rank===rank&&row.role===role&&row.region==='CN'&&ageInDays(row.asOf,now)<=4;
}

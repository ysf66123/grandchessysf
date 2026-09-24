// Shared freshness rules: a newly downloaded page is not necessarily a new guide.
const DAY=86400000;
export function ageInDays(value,now=Date.now()){
  const time=Date.parse(value);
  return !Number.isFinite(time)||time>now+300000?Infinity:Math.max(0,(now-time)/DAY);
}
export function guideQuality(data,champion,role,now=Date.now(),variant=''){
  const build=championBuilds(champion).find(b=>b.role===role&&b.guideId===variant)||champion?.builds?.find(b=>b.role===role),issues=[];
  const failed=build?.sourceId==='wildriftcore'?false:champion?.refreshFailed,fetchedAt=build?.fetchedAt||champion?.fetchedAt;
  if(!build)issues.push('Bu rol için kaynak rehber yok.');
  if(build&&build.patch!==data.latestPatch?.version)issues.push('Rehber, son resmî yamayla eşleşmiyor.');
  if(failed)issues.push('Son kontrolde bu rehber yenilenemedi.');
  if(ageInDays(fetchedAt,now)>7)issues.push('Rehber yedi gündür doğrulanmadı.');
  const normalized=build?.sourceSlotCount===7||build?.situational?.some(s=>s.condition==='Active item alternative');
  if(normalized)issues.push('Kaynak yedi eşya verdi; altı yuvalı dizilime dönüştürüldü. Son yuva ayrıca kontrol edilmeli.');
  const usable=!!build&&build.patch===data.latestPatch?.version&&!failed&&ageInDays(fetchedAt,now)<=7;
  return {usable,normalized,issues,level:!usable?'old':normalized?'limited':'current',label:!usable?'Doğrulama bekliyor':normalized?'Kaynakta tutarsızlık var':'Yama ve tarih uyumlu'};
}
export function championBuilds(champion){return [...(champion?.builds||[]),...(champion?.sourceBuilds||[])];}
export function dataQuality(data,now=Date.now()){
  const guides=data.champions.flatMap(c=>c.roles.map(role=>({id:c.id,role,...guideQuality(data,c,role,now)})));
  return {guides,current:guides.filter(g=>g.usable).length,limited:guides.filter(g=>g.normalized).length,
    missing:guides.filter(g=>!g.usable).length,total:guides.length,
    statsCurrent:data.stats.patch===data.latestPatch.version&&ageInDays(data.stats.asOf,now)<4,
    stale:ageInDays(data.checkedAt,now)>2};
}

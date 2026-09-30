// Shared freshness rules: a newly downloaded page is not necessarily a new guide.
const DAY=86400000;
export function ageInDays(value,now=Date.now()){
  const time=Date.parse(value);
  return !Number.isFinite(time)||time>now+300000?Infinity:Math.max(0,(now-time)/DAY);
}
export function guideQuality(data,champion,role,now=Date.now(),variant=''){
  const build=championBuilds(champion).find(b=>b.role===role&&b.guideId===variant)||champion?.builds?.find(b=>b.role===role),issues=[];
  const reviewed=build?.patch==='7.3'&&data.latestPatch?.version==='7.3a'&&build?.verifiedForPatch==='7.3a'&&build?.patchReviewUrl==='https://wildrift.leagueoflegends.com/tr-tr/news/game-updates/wild-rift-patch-notes-7-3a/';
  const failed=build?.sourceId==='wildriftcore'?data.buildSources?.failures?.includes(champion?.id):build?.sourceId==='wrmeta'?(data.evidence?.providers?.find(p=>p.id==='wrmeta')?.pages?.[champion?.id]?.buildFailure||data.evidence?.providers?.find(p=>p.id==='wrmeta')?.pages?.[champion?.id]?.status==='failed'):champion?.refreshFailed,fetchedAt=build?.fetchedAt||champion?.fetchedAt;
  if(!build)issues.push('Bu rol için kaynak rehber yok.');
  if(build&&build.patch!==data.latestPatch?.version)issues.push(reviewed?'Kaynak 7.3 etiketli; şampiyon ve bu setteki eşyalar 7.3a değişikliklerinden etkilenmiyor.':'Rehber, son resmî yamayla eşleşmiyor.');
  if(failed)issues.push('Son kontrolde bu rehber yenilenemedi.');
  if(ageInDays(fetchedAt,now)>7)issues.push('Rehber yedi gündür doğrulanmadı.');
  const editorialBeforePatch=build?.sourceId==='wrmeta'&&Number.isFinite(Date.parse(build.updatedAt))&&Date.parse(build.updatedAt)<Date.parse(data.latestPatch?.publishedAt);
  if(editorialBeforePatch)issues.push('Yama etiketi sayfa başlığından alındı; rehberin yayımlanan düzenleme tarihi son yamadan önce.');
  const normalized=build?.sourceSlotCount===7||build?.situational?.some(s=>s.condition==='Active item alternative');
  if(normalized)issues.push('Kaynak yedi eşya verdi; altı yuvalı dizilime dönüştürüldü. Son yuva ayrıca kontrol edilmeli.');
  const impact=data.patchImpact,affected=impact?.patch===data.latestPatch.version&&impact.scopeVerified&&((impact.champions||[]).includes(champion?.id)||build?.final.some(id=>(impact.items||[]).includes(id)));
  const editTime=Date.parse(build?.updatedAt),patchTime=Date.parse(data.latestPatch?.publishedAt);
  const quarantined=!!affected&&Number.isFinite(patchTime)&&(Number.isFinite(editTime)?editTime<patchTime:build?.provenance?.patchScope==='page-header');
  const impactUnknown=build?.provenance?.patchScope==='page-header'&&impact?.scopeVerified===false;
  if(quarantined)issues.push('Şampiyon veya setin eşyası son yamada değişti; içerik tarihi eski olduğundan yeniden doğrulanana kadar otomatik öneri dışında.');
  if(impactUnknown)issues.push('Resmî yamanın etki kapsamı okunamadı; sayfa başlığı tek başına yeterli doğrulama değil.');
  const usable=!!build&&(build.patch===data.latestPatch?.version||reviewed)&&!failed&&!quarantined&&!impactUnknown&&ageInDays(fetchedAt,now)<=7;
  return {usable,quarantined,affected,impactUnknown,normalized,reviewed,editorialBeforePatch,issues,level:!usable?'old':normalized||reviewed||editorialBeforePatch?'limited':'current',label:quarantined?'Yama değişikliği için yeniden doğrulama bekliyor':!usable?'Doğrulama bekliyor':normalized?'Kaynakta tutarsızlık var':reviewed?'Ara yama uyumluluğu kontrol edildi':editorialBeforePatch?'İçerik tarihi ile yama etiketi ayrı':'Yama ve tarih uyumlu'};
}
export function championBuilds(champion){return [...(champion?.builds||[]),...(champion?.sourceBuilds||[])];}
export function dataQuality(data,now=Date.now()){
  const guides=data.champions.flatMap(c=>c.roles.map(role=>({id:c.id,role,...guideQuality(data,c,role,now)})));
  return {guides,current:guides.filter(g=>g.usable).length,limited:guides.filter(g=>g.normalized).length,
    missing:guides.filter(g=>!g.usable).length,total:guides.length,
    statsCurrent:data.stats.patch===data.latestPatch.version&&ageInDays(data.stats.asOf,now)<4,
    stale:ageInDays(data.checkedAt,now)>2};
}

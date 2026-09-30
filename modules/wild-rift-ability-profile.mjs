// Reference scenarios are not live levels, a full combo, hit probabilities or DPS.
export function abilityProfile(combat,stats,attack,base,stageInputs=null){
 const title=String(base?.label||'')+' '+String(base?.guideId||'');
 const form=/darkin|rhaast|kırmızı/i.test(title)?'darkin':/shadow|assassin|gölge/i.test(title)?'shadow':null;
 const abilities=(combat?.abilityFacts||[]).filter(a=>!a.form||a.form===form),packets=abilities.flatMap(a=>a.damagePackets||[]).filter(p=>p.parsed);
 const scalingStats=new Set();
 function evaluate(level,equipment,itemIds=[]){
  const ranks={};for(const slot of (base?.skillOrder||[]).slice(0,level))if(slot)ranks[String(slot)]=(ranks[String(slot)]||0)+1;
  const native={};for(const [k,v] of Object.entries(combat?.stats||{}))native[k]=v.base+v.growth*(level-1);
  const totals={physical:0,magic:0,true:0};let excluded=0;
  for(const a of abilities){
   const rank=a.slot==='P'?1:ranks[a.slot]||0;if(!rank)continue;
   for(const p of a.damagePackets||[]){
    if(!p.parsed)continue;
    if(p.conditional||p.healthBasis||p.baseUnit==='percent'||p.attackTriggered||p.repeated){excluded++;continue;}
    const pick=values=>values?.[Math.min(rank-1,values.length-1)]||0;
    let contribution=p.baseUnit==='flat'?pick(p.baseValues):0;
    for(const r of p.scalings){scalingStats.add(r.stat);contribution+=pick(r.coefficients)*((equipment[r.stat]||0)+(r.bonus?0:native[r.stat]||0));}
    totals[p.type]+=contribution;
   }
  }
  // One unempowered physical attack is a channel reference for attack builds.
  if(attack)totals.physical+=(native.ad||0)+(equipment.ad||0);
  const resistible=totals.physical+totals.magic;
  const damage=resistible<=0?null:totals.magic>=resistible*.75?'magic':totals.physical>=resistible*.75?'physical':'mixed';
  return {level,ranks,itemIds,damage,excluded,totals};
 }
 const stages=(stageInputs||[5,9,13].map(level=>({level,stats}))).map(s=>evaluate(s.level,s.stats,s.itemIds));
 const damage=stages[1]?.damage||stages.find(s=>s.damage)?.damage||null;
 return {damage,form,forms:[...new Set((combat?.abilityFacts||[]).map(a=>a.form).filter(Boolean))],packets:packets.length,scalingStats:[...scalingStats],trueDamage:packets.some(p=>p.type==='true'),conditional:packets.some(p=>p.conditional||p.healthBasis||p.repeated),stages,basis:packets.length?'5 / 9 / 13. seviye referansı; kaynak yetenek sırası, taban nitelikler ve 1 / 3 / 5 ana eşya. Koşullu, çok vuruşlu ve hedef canına bağlı hasar kesin toplam sayılmaz.':'Sayısal yetenek kapsamı eksik; kaynak eşya düzeni ve doğrulanan hasar kanalları kullanılıyor.'};
}

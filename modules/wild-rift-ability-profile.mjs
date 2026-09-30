// This describes verified damage channels, not a combat simulation or DPS.
export function abilityProfile(combat,stats,attack,base){
 const title=String(base?.label||'')+' '+String(base?.guideId||'');
 const form=/darkin|rhaast|kırmızı/i.test(title)?'darkin':/shadow|assassin|gölge/i.test(title)?'shadow':null;
 const abilities=(combat?.abilityFacts||[]).filter(a=>!a.form||!form||a.form===form),packets=abilities.flatMap(a=>a.damagePackets||[]).filter(p=>p.parsed);
 const totals={physical:0,magic:0,true:0},scalingStats=new Set();
 for(const p of packets){
  const base=p.baseUnit==='flat'?p.baseValues?.[0]||0:0;
  let contribution=base;
  for(const r of p.scalings){scalingStats.add(r.stat);contribution+=(r.coefficients[0]||0)*(stats[r.stat]||0);}
  // Target-health and conditional bonuses are channels, not assumed procs.
  if(!p.conditional&&!p.healthBasis)totals[p.type]+=contribution;
 }
 if(attack)totals.physical+=Math.max(60,stats.ad||0)*2;
 const resistible=totals.physical+totals.magic;
 const damage=resistible<=0?null:totals.magic>=resistible*.75?'magic':totals.physical>=resistible*.75?'physical':'mixed';
 return {damage,form,forms:[...new Set((combat?.abilityFacts||[]).map(a=>a.form).filter(Boolean))],packets:packets.length,scalingStats:[...scalingStats],trueDamage:packets.some(p=>p.type==='true'),conditional:packets.some(p=>p.conditional||p.healthBasis),basis:packets.length?'Kaynak yeteneklerinin hasar türü, ilk kademe taban değeri ve seçilen setin ölçekleri; gerçek hasar oranı değildir.':'Sayısal yetenek kapsamı eksik; kaynak eşya düzeni ve doğrulanan hasar kanalları kullanılıyor.'};
}

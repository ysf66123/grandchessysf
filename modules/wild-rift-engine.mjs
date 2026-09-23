import {ROLES,traits,CONDITIONS,CHAMPION_TIPS} from './wild-rift-knowledge.mjs?v=20260923-wr1';
export {ROLES};
export const emptyDraft=()=>({blue:{},red:{},role:'mid',rank:'diamond',bans:[],pool:[],fed:'',locked:[],tab:'counters'});
export function sanitizeDraft(value,data){
  const d=emptyDraft(),ids=new Set(data.champions.map(c=>c.id));
  if(!value || typeof value!=='object')return d;
  if(ROLES[value.role])d.role=value.role;
  if(data.stats.brackets[value.rank])d.rank=value.rank;
  const used=new Set();
  for(const side of ['blue','red'])for(const role of Object.keys(ROLES))if(ids.has(value[side]?.[role]) && !used.has(value[side][role])){d[side][role]=value[side][role];used.add(value[side][role]);}
  d.bans=[...new Set((Array.isArray(value.bans)?value.bans:[]).filter(id=>ids.has(id)&&!used.has(id)))];
  d.pool=[...new Set((Array.isArray(value.pool)?value.pool:[]).filter(id=>ids.has(id)))];
  d.fed=Object.values(d.red).includes(value.fed)?value.fed:'';
  d.locked=(Array.isArray(value.locked)?value.locked:[]).filter(id=>data.items[id]).slice(0,7);
  d.tab=['counters','build','coach','team','patch'].includes(value.tab)?value.tab:'counters';return d;
}
export function buildFor(c,role){return c?.builds?.find(b=>b.role===role)||null;}
const TEAR_ITEMS=['tear-of-the-goddess','manamune','muramana','archangels-staff','seraphs-embrace','winters-approach','fimbulwinter','whispering-circlet','diadem-of-songs'];
const itemFamily=id=>TEAR_ITEMS.includes(id)?'tear':id;
export function freshness(data,now=Date.now()){
  const age=(now-Date.parse(data.checkedAt))/86400000;
  return {stale:age>2,age,statsCurrent:data.stats.patch===data.latestPatch.version && (now-Date.parse(data.stats.asOf))/86400000<4};
}
export function threats(data,draft){
  const result={physical:0,magic:0,mixed:0,heal:0,shield:0,tank:0,cc:0,burst:0,poke:0,attack:0,engage:0};
  for(const [role,id] of Object.entries(draft.red)){
    const c=data.champions.find(c=>c.id===id);if(!c)continue;
    const t=traits(c),weight=(role===draft.role?1.5:1)+(id===draft.fed?1.5:0);
    for(const key of Object.keys(result)) if(t[key] || key===t.damage)result[key]+=weight;
  }
  return result;
}
export function recommendations(data,draft){
  const byId=new Map(data.champions.map(c=>[c.id,c]));
  const enemy=byId.get(draft.red[draft.role]),oppBuild=buildFor(enemy,draft.role),team=Object.values(draft.blue).map(id=>byId.get(id)).filter(Boolean);
  const taken=new Set([...Object.values(draft.blue),...Object.values(draft.red),...draft.bans]);
  const threat=threats(data,draft),state=freshness(data),rankRows=data.stats.brackets[draft.rank]||[];
  return data.champions.filter(c=>c.roles.includes(draft.role)&&!taken.has(c.id)&&(!draft.pool.length||draft.pool.includes(c.id))).map(c=>{
    const t=traits(c),b=buildFor(c,draft.role),stat=rankRows.find(s=>s.id===c.id&&s.role===draft.role),tier=c.tiers[draft.role];
    const base=({ 'S+':38,S:32,A:23,B:14,C:7 })[tier]??12;
    // A heuristic fit score, never a probability. Small-sample win rates cannot dominate.
    let score=base+(state.statsCurrent&&stat?Math.max(-5,Math.min(5,(stat.win-50)*.8)):0);
    const reasons=[],risks=[];
    const current=b?.patch===data.latestPatch.version && !c.refreshFailed;
    if(enemy && oppBuild?.patch===data.latestPatch.version && oppBuild.counters.includes(c.id)){score+=23;reasons.push(`${enemy.name} rehberinde karşı seçim olarak yer alıyor.`);}
    if(enemy && current && b.counters.includes(enemy.id)){score-=20;risks.push(`${enemy.name}, bu şampiyonun rehberinde zor eşleşme olarak belirtiliyor.`);}
    if(t.tankbuster && threat.tank>=2){score+=10;reasons.push('Rakibin dayanıklı ön saflarına karşı sürekli hasar sağlar.');}
    if(t.peel && threat.engage>=2){score+=9;reasons.push('Rakibin dalışına karşı taşıyıcını koruyabilir.');}
    if(t.engage && team.length>=2 && !team.some(a=>traits(a).engage)){score+=7;reasons.push('Takımın eksik olan savaşı başlatma ihtiyacını karşılar.');}
    if(t.magic && team.length>=2 && team.every(a=>traits(a).damage==='physical')){score+=7;reasons.push('Takımın hasar dağılımına büyü hasarı ekler.');}
    if(t.tank && team.length>=2 && !team.some(a=>traits(a).tank)){score+=6;reasons.push('Takıma ön saflarda dayanıklılık kazandırır.');}
    if(current)for(const ally of team)if(b.synergies.includes(ally.id)){score+=5;reasons.push(`${ally.name} ile rehberde belirtilmiş uyumu var.`);}
    if(t.scaling && enemy && traits(enemy).burst)risks.push('Güçlenmeden önce erken baskıya karşı dikkatli oyna.');
    if(!reasons.length)reasons.push(enemy?'Meta gücüne göre aday; bu eşleşmede doğrudan karşı seçim kanıtı sınırlı.':'Rakip seçimleri geldikçe eşleşme değerlendirmesi güncellenir.');
    if(!current)risks.push('Bu rolün eşya rehberi güncel yamayla doğrulanmış değil.');
    return {champion:c,tier,stat,score:Math.round(score),reasons,risks,evidence:enemy&&oppBuild?.patch===data.latestPatch.version&&oppBuild.counters.includes(c.id)?'Rehber eşleşmesi':'Meta ve takım kuralları'};
  }).sort((a,b)=>b.score-a.score||a.champion.name.localeCompare(b.champion.name,'tr'));
}
export function recommendBuild(data,draft){
  const c=data.champions.find(c=>c.id===draft.blue[draft.role]),base=buildFor(c,draft.role);
  if(!base)return {champion:c,missing:true};
  const threat=threats(data,draft),current=base.patch===data.latestPatch.version&&!c.refreshFailed;
  const final=[...base.final],changes=[],alternatives=[];
  const protectedCore=new Set(base.core.slice(0,2).map(itemFamily));
  for(const s of base.situational){
    const rule=CONDITIONS[s.condition];if(!rule||s.items.length!==2)continue;
    const [from,to]=s.items;if(!data.items[to])continue;
    alternatives.push({from,to,label:rule.label,priority:threat[rule.key]||0});
  }
  const boot=base.boots.find(id=>final.includes(id));
  if(boot){
    if(data.items['mercurys-treads'] && boot!=='mercurys-treads')alternatives.push({from:boot,to:'mercurys-treads',priority:threat.magic>=3?threat.magic:0,label:'Yoğun büyü hasarına karşı; botun saldırı avantajından vazgeçilir'});
    if(data.items['plated-steelcaps'] && boot!=='plated-steelcaps')alternatives.push({from:boot,to:'plated-steelcaps',priority:threat.physical>=3&&threat.attack>=2?threat.physical:0,label:'Fiziksel normal saldırı baskısına karşı; botun saldırı avantajından vazgeçilir'});
  }
  alternatives.sort((a,b)=>b.priority-a.priority);
  for(const id of draft.locked){
    if(final.includes(id))continue;
    const alt=alternatives.find(a=>a.to===id&&final.includes(a.from));
    if(alt&&!conflicts(final.filter(x=>x!==alt.from),id)){final[final.indexOf(alt.from)]=id;changes.push({...alt,label:'Satın aldığın eşya korunuyor'});}
  }
  // Only source-approved one-for-one swaps; protect the first two core items and purchases.
  for(const alt of alternatives){
    if(!current || alt.priority<1.5 || changes.length>=2 || draft.locked.includes(alt.from) || protectedCore.has(itemFamily(alt.from)))continue;
    const index=final.indexOf(alt.from);if(index<0 || final.includes(alt.to))continue;
    if(conflicts(final.filter(x=>x!==alt.from),alt.to))continue;
    final[index]=alt.to;changes.push(alt);
  }
  return {champion:c,base,final,changes,alternatives,current,missing:false,threat};
}
function conflicts(items,id){
  const groups=[TEAR_ITEMS,['mortal-reminder','seryldas-grudge','lord-dominiks-regard'],['trinity-force','divine-sunderer','iceborn-gauntlet','lich-bane'],['steraks-gage','maw-of-malmortius','immortal-shieldbow']];
  return groups.some(g=>g.includes(id)&&items.some(i=>g.includes(i)));
}
export function coaching(data,draft){
  const c=data.champions.find(c=>c.id===draft.blue[draft.role]),enemy=data.champions.find(c=>c.id===draft.red[draft.role]);
  if(!c)return [];
  const t=traits(c),e=traits(enemy),text=[];
  if(CHAMPION_TIPS[c.id])text.push(CHAMPION_TIPS[c.id]);
  if(draft.role==='jungle')text.push('Koridorların önceliğini kontrol etmeden rakip ormana girme. Rakip ormancının görüldüğü tarafı kullanarak karşı taraftaki kamp veya objektifi değerlendir.');
  else if(draft.role==='support'||draft.role==='duo')text.push('Ejder koridorunu ikiye iki değerlendir. Partnerin menzil dışında veya önemli yeteneği beklemedeyken tek başına takas başlatma.');
  else text.push('Rakip ormancı görünmüyorsa dalgayı güvenli tarafta tut. Rakibi geri gönderdiğinde dalgayı kuleye ulaştırıp alışveriş için dön.');
  if(e.burst)text.push(`${enemy.name} karşısında önemli savunma veya kaçış yeteneğin yokken uzun takası zorlama. Rakibin ana hasar yeteneği boşa çıktığında kısa takas ara.`);
  if(e.poke)text.push(`${enemy.name} menzilli baskı kurabilir. Gereksiz can kaybetmeden son vuruş al; rakibin atışının minyonlardan geçip geçmediğine göre pozisyon al.`);
  if(e.heal)text.push(`${enemy.name} uzayan dövüşlerde can yenileyebilir. Öldürme penceresi yoksa takası kes; iyileşme azaltmayı takımınla paylaş.`);
  if(e.cc)text.push(`${enemy.name} kontrol yeteneğini kullandıktan sonra hareket alanın açılır. Görüşsüz bölgede bu yeteneği hazırken yaklaşma.`);
  if(t.scaling)text.push('Erken oyunda gereksiz düello yerine gelir ve deneyimi koru. Ana eşyan tamamlandığında takımına güçlenme noktanı bildir.');
  text.push(t.tank||t.engage?'Takım savaşına girmeden önce takımının seni takip edebileceğini kontrol et. Taşıyıcın dalış tehdidi altındaysa korumayı girişe tercih et.':'Takım savaşında ulaşabildiğin güvenli hedefe hasar ver. Rakip arka safa ulaşmak için görüşsüz bölgeye yalnız girme.');
  text.push('Öndeyken dalga üstünlüğünü objektif ve görüşe çevir. Gerideyken rakibe ikinci bir avantaj verecek takiplerden kaçın, güvenli dalga ve takım savunmasına dön.');
  return text;
}

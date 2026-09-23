import {ROLES,traits,CONDITIONS,CHAMPION_TIPS} from './wild-rift-knowledge.mjs?v=20260923-wr4';
import {ageInDays,guideQuality} from './wild-rift-quality.mjs?v=20260923-wr4';
import {relationshipEvidence,itemAvailability} from './wild-rift-evidence.mjs?v=20260923-wr4';
export {ROLES};
export const SORT_MODES={balanced:'Dengeli öneri',lane:'Koridor eşleşmesi',team:'Takım uyumu',safe:'Güvenli seçim'};
export const emptyDraft=()=>({blue:{},red:{},role:'mid',rank:'diamond',bans:[],pool:[],fed:'',locked:[],tab:'counters',uncertain:[],comfort:{},sort:'balanced',overrides:{},compare:[],gold:0,owned:[],enemyItems:{},variant:''});
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
  d.locked=[...new Set((Array.isArray(value.locked)?value.locked:[]).filter(id=>itemAvailability(data,id)))].slice(0,6);
  d.uncertain=[...new Set((Array.isArray(value.uncertain)?value.uncertain:[]).filter(id=>Object.values(d.red).includes(id)))];
  if(SORT_MODES[value.sort])d.sort=value.sort;
  for(const c of data.champions)if([1,2].includes(value.comfort?.[c.id]))d.comfort[c.id]=value.comfort[c.id];
  d.compare=[...new Set((Array.isArray(value.compare)?value.compare:[]).filter(id=>ids.has(id)))].slice(0,3);
  for(const [from,to] of Object.entries(value.overrides||{}))if(itemAvailability(data,from)&&itemAvailability(data,to))d.overrides[from]=to;
  d.gold=Number.isFinite(Number(value.gold))?Math.max(0,Math.min(30000,Math.floor(Number(value.gold)))):0;
  d.owned=(Array.isArray(value.owned)?value.owned:[]).filter(id=>itemAvailability(data,id)).slice(0,6);
  for(const id of Object.values(d.red))d.enemyItems[id]=[...new Set((Array.isArray(value.enemyItems?.[id])?value.enemyItems[id]:[]).filter(i=>itemAvailability(data,i)))].slice(0,6);
  const own=data.champions.find(c=>c.id===d.blue[d.role]);
  if(own?.builds.some(b=>b.role===d.role&&b.guideId===value.variant))d.variant=value.variant;
  d.tab=['counters','build','coach','team','patch'].includes(value.tab)?value.tab:'counters';return d;
}
export function buildFor(c,role,variant=''){return c?.builds?.find(b=>b.role===role&&b.guideId===variant)||c?.builds?.find(b=>b.role===role)||null;}
export function movePick(data,draft,side,from,to){
  if(!['blue','red'].includes(side)||!ROLES[from]||!ROLES[to]||!draft[side]?.[from])return draft;
  const next=structuredClone(draft),first=next[side][from],second=next[side][to];
  next[side][to]=first;if(second)next[side][from]=second;else delete next[side][from];
  if(side==='blue'&&from!==to&&(from===draft.role||to===draft.role)){next.locked=[];next.owned=[];next.overrides={};next.variant='';}
  return sanitizeDraft(next,data);
}
const TEAR_ITEMS=['tear-of-the-goddess','manamune','muramana','archangels-staff','seraphs-embrace','winters-approach','fimbulwinter','whispering-circlet','diadem-of-songs'];
const itemFamily=id=>TEAR_ITEMS.includes(id)?'tear':id;
export function freshness(data,now=Date.now()){
  const age=ageInDays(data.checkedAt,now);
  return {stale:age>2,age,statsCurrent:data.stats.patch===data.latestPatch.version && ageInDays(data.stats.asOf,now)<4};
}
// Enumerate legal role assignments, not guessed probabilities for flex picks.
export function laneScenarios(data,draft){
  const byId=new Map(data.champions.map(c=>[c.id,c])),flex=new Set(draft.uncertain||[]);
  const fixed=Object.fromEntries(Object.entries(draft.red).filter(([,id])=>!flex.has(id)));
  const pending=Object.entries(draft.red).filter(([,id])=>flex.has(id));
  const assignments=[];
  function assign(index,team){
    if(index===pending.length){assignments.push({...team});return;}
    const [original,id]=pending[index],roles=byId.get(id)?.roles||[original];
    for(const role of roles)if(!team[role]){team[role]=id;assign(index+1,team);delete team[role];}
  }
  assign(0,{...fixed});
  const valid=assignments.length>0;
  // Impossible assignments are shown as unresolved, never silently treated as certain.
  const opponents=valid?[...new Set(assignments.map(t=>t[draft.role]||null))]:[null];
  return {valid,count:assignments.length,opponents:opponents.map(id=>byId.get(id)||null),uncertain:pending.length>0};
}
export function threats(data,draft){
  const result={physical:0,magic:0,mixed:0,heal:0,shield:0,tank:0,cc:0,burst:0,poke:0,attack:0,engage:0,critical:0,armor:0,magicResist:0};
  for(const [role,id] of Object.entries(draft.red)){
    const c=data.champions.find(c=>c.id===id);if(!c)continue;
    const t=traits(c),weight=(role===draft.role&&!(draft.uncertain||[]).includes(id)?1.5:1)+(id===draft.fed?1.5:0);
    for(const key of Object.keys(result)) if(t[key] || key===t.damage)result[key]+=weight;
    const gear=(draft.enemyItems?.[id]||[]).map(i=>data.items[i]).filter(i=>i?.costPatch===data.latestPatch.version&&ageInDays(i.costCheckedAt)<=7);
    for(const [key,stat] of [['critical','crit'],['armor','armor'],['magicResist','magicResist']])if(gear.some(i=>(i.stats?.[stat]||0)>0))result[key]+=weight;
  }
  return result;
}
export function recommendations(data,draft){
  const byId=new Map(data.champions.map(c=>[c.id,c]));
  const scenarios=laneScenarios(data,draft),team=Object.entries(draft.blue).filter(([r])=>r!==draft.role).map(([,id])=>byId.get(id)).filter(Boolean);
  const taken=new Set([...Object.values(draft.blue),...Object.values(draft.red),...draft.bans]);
  const threat=threats(data,draft),state=freshness(data),rankRows=data.stats.brackets[draft.rank]||[];
  return data.champions.filter(c=>c.roles.includes(draft.role)&&!taken.has(c.id)&&(!draft.pool.length||draft.pool.includes(c.id))).map(c=>{
    const t=traits(c),b=buildFor(c,draft.role),stat=rankRows.find(s=>s.id===c.id&&s.role===draft.role),tier=c.tiers[draft.role];
    const base=({ 'S+':38,S:32,A:23,B:14,C:7 })[tier]??12;
    const quality=guideQuality(data,c,draft.role),current=quality.usable,reasons=[],risks=[...quality.issues];
    const matchups=scenarios.opponents.map(enemy=>{
      const oppBuild=buildFor(enemy,draft.role),oppCurrent=enemy&&guideQuality(data,enemy,draft.role).usable;
      const supporting=enemy?relationshipEvidence(data,enemy.id,c.id,draft.role):[],opposing=enemy?relationshipEvidence(data,c.id,enemy.id,draft.role):[];
      const positive=supporting.length>0,negative=opposing.length>0;
      if(positive&&negative){risks.push(`${enemy.name} için iki kaynak rehber birbiriyle çelişiyor; karşı seçim bonusu verilmedi.`);return {enemy,value:0,known:false,conflict:true};}
      if(positive)reasons.push(`${enemy.name} için ${supporting.length} kaynakta karşı seçim olarak yer alıyor.${scenarios.uncertain?' Koridoru kesinleşmeli.':''}`);
      if(negative)risks.push(`${enemy.name}, bu şampiyonun rehberinde zor eşleşme olarak belirtiliyor.`);
      return {enemy,value:positive?Math.min(27,23+(supporting.length-1)*2):negative?-20:0,known:positive||negative,sources:[...supporting,...opposing]};
    });
    const laneMin=Math.min(...matchups.map(m=>m.value)),laneMax=Math.max(...matchups.map(m=>m.value));
    // Until the lane is confirmed use the worst supported scenario; never average into a fake win chance.
    const parts={meta:base,statistics:state.statsCurrent&&stat?Math.max(-5,Math.min(5,(stat.win-50)*.8)):0,lane:laneMin,team:0,comfort:(draft.comfort?.[c.id]||0)*3,safety:0};
    const add=(value,reason)=>{parts.team+=value;reasons.push(reason);};
    if(t.tankbuster&&threat.tank>=2)add(10,'Rakibin dayanıklı ön saflarına karşı sürekli hasar sağlar.');
    if(t.peel&&threat.engage>=2)add(9,'Rakibin dalışına karşı taşıyıcını koruyabilir.');
    if(t.engage&&team.length>=2&&!team.some(a=>traits(a).engage))add(7,'Takımın eksik olan savaşı başlatma ihtiyacını karşılar.');
    if(t.magic&&team.length>=2&&team.every(a=>traits(a).damage==='physical'))add(7,'Takımın hasar dağılımına büyü hasarı ekler.');
    if(t.tank&&team.length>=2&&!team.some(a=>traits(a).tank))add(6,'Takıma ön saflarda dayanıklılık kazandırır.');
    for(const ally of team)if(relationshipEvidence(data,c.id,ally.id,draft.role,'synergy').length)add(5,`${ally.name} ile kaynakta belirtilmiş uyumu var.`);
    parts.team=Math.min(24,parts.team);
    if(t.scaling&&scenarios.opponents.some(e=>traits(e).burst)){parts.safety-=4;risks.push('Güçlenmeden önce erken baskıya karşı dikkatli oyna.');}
    if(!current)parts.safety-=8;
    if(matchups.some(m=>m.conflict))parts.safety-=5;
    if(state.stale)risks.push('Meta kaynağının son kontrolü eski; yeniden kontrol et.');
    if(!scenarios.valid)risks.push('Rakiplerin olası koridorları çakışıyor. Koridorları netleştir.');
    if(!reasons.length)reasons.push('Meta ve takım özelliklerine göre aday; doğrudan karşı seçim kanıtı sınırlı.');
    const weights={balanced:{lane:1,team:1,safety:1},lane:{lane:1.5,team:.5,safety:1},team:{lane:.75,team:1.5,safety:1},safe:{lane:1.25,team:.75,safety:2}}[draft.sort]||{lane:1,team:1,safety:1};
    const score=parts.meta+parts.statistics+parts.comfort+parts.lane*weights.lane+parts.team*weights.team+parts.safety*weights.safety;
    const known=matchups.some(m=>m.known),confidence=!current||state.stale?'low':scenarios.uncertain||matchups.some(m=>m.conflict)||!known?'limited':'supported';
    return {champion:c,tier,stat,statsCurrent:state.statsCurrent,score:Math.round(score),parts,laneRange:[laneMin,laneMax],matchups,quality,confidence,reasons,risks:[...new Set(risks)],evidence:known?'Rehber eşleşmesi':'Meta ve takım kuralları'};
  }).sort((a,b)=>b.score-a.score||a.champion.name.localeCompare(b.champion.name,'tr'));
}
export function recommendBuild(data,draft){
  const c=data.champions.find(c=>c.id===draft.blue[draft.role]),base=buildFor(c,draft.role,draft.variant);
  if(!base)return {champion:c,missing:true};
  const invalidItems=base.final.filter(id=>!itemAvailability(data,id));
  if(invalidItems.length)return {champion:c,missing:true,invalidItems};
  const threat=threats(data,draft),quality=guideQuality(data,c,draft.role,Date.now(),draft.variant),current=quality.usable;
  const final=[...base.final],changes=[],alternatives=[];
  const protectedCore=new Set(base.core.slice(0,2).map(itemFamily));
  for(const s of base.situational){
    const rule=CONDITIONS[s.condition];if(!rule||s.items.length!==2)continue;
    const [from,to]=s.items;if(!itemAvailability(data,to))continue;
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
  const rejected=[];
  for(const [from,to] of Object.entries(draft.overrides||{})){
    if(!current){rejected.push('Güncel olmayan rehberde elle alternatif uygulanmadı.');continue;}
    const alt=alternatives.find(a=>a.from===from&&a.to===to);
    const slot=base.final.indexOf(from),present=slot>=0?final[slot]:null;
    if(!alt||!present||draft.locked.includes(present)||protectedCore.has(itemFamily(from))||final.some((id,i)=>id===to&&i!==slot)||conflicts(final.filter((_,i)=>i!==slot),to)){
      rejected.push('Alternatif; ana eşya, satın alma veya eşya çakışması nedeniyle uygulanmadı.');continue;
    }
    final[slot]=to;
    for(let i=changes.length-1;i>=0;i--)if(changes[i].from===from)changes.splice(i,1);
    if(to!==from)changes.push({...alt,label:'Elle seçtiğin kaynak alternatifi'});
  }
  return {champion:c,base,final,changes,alternatives,current,quality,rejected,missing:false,threat};
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
export function matchupPlan(data,draft){
  const own=data.champions.find(c=>c.id===draft.blue[draft.role]);if(!own)return [];
  const scenarios=laneScenarios(data,draft),sections=[];
  const knowledge=scenarios.opponents.filter(Boolean).filter(c=>CHAMPION_TIPS[c.id]);
  if(knowledge.length)sections.push({title:'Rakibin oyun planını tanı',basis:scenarios.uncertain?'Olası koridor rakipleri; eşleşme henüz kesin değil.':'Elle tanımlanmış şampiyon ilkeleri; yetenek bekleme süreleri canlı okunmaz.',lines:knowledge.map(c=>`${c.name}: ${CHAMPION_TIPS[c.id]}`)});
  if(draft.role==='duo'||draft.role==='support'){
    const partnerRole=draft.role==='duo'?'support':'duo',partner=data.champions.find(c=>c.id===draft.blue[partnerRole]);
    const enemies=['duo','support'].map(r=>data.champions.find(c=>c.id===draft.red[r])).filter(Boolean),lines=[];
    if(!partner)lines.push('Kendi koridor partnerini de seç; tek şampiyon üzerinden ikiye iki koridor üstünlüğü çıkarılamaz.');
    else{
      const ownGuide=buildFor(own,draft.role,draft.variant),partnerGuide=buildFor(partner,partnerRole);
      const synergy=guideQuality(data,own,draft.role).usable&&ownGuide?.synergies.includes(partner.id)||guideQuality(data,partner,partnerRole).usable&&partnerGuide?.synergies.includes(own.id);
      lines.push(synergy?`${own.name} ve ${partner.name} arasında güncel kaynak rehberde uyum belirtiliyor. Bu, karşı ikiliye karşı kazanma oranı değildir.`:`${partner.name} ile bu ikili için doğrudan kaynak uyum kaydı bulunamadı. Yeteneklerini aynı takas penceresine denk getir.`);
    }
    if(enemies.some(c=>traits(c).engage))lines.push('Rakip ikilinin giriş yeteneği hazırken partnerinden kopma. Yakalanan oyuncuyu takip edip ikinci kaybı vermeden önce takasın kazanılıp kazanılamayacağını değerlendir.');
    if(enemies.some(c=>traits(c).poke))lines.push('Menzilli baskı altında aynı açıdan iki kişinin birden hasar almasını önle. Minyon dalgası ve partnerinin canı uygunsa birlikte kısa takas yap.');
    if(enemies.some(c=>traits(c).heal||traits(c).shield))lines.push('Rakibin koruma veya iyileştirme yeteneğini harcamasını bekle. Aynı hedefe eş zamanlı baskı kur; gerekli karşı eşyayı takım içinde kimin alacağını belirle.');
    if(enemies.length<2)lines.push('Rakip nişancı ve destek birlikte girilmediği için ikiye iki değerlendirme eksik.');
    sections.push({title:'İkiye iki koridor planı',basis:'Partner, iki rakip ve kaynakta belirtilen uyum birlikte değerlendirilir.',lines});
  }
  const e=scenarios.opponents.filter(Boolean),t=traits(own);
  sections.push({title:'İlk dalgalar ve güvenli takas',basis:'Koridor durumuna bağlı ilkeler; sayısal hasar simülasyonu değildir.',lines:[
    draft.role==='jungle'?'İlk rota için baskın yapılacak koridorun kontrol yeteneğini ve dalgasını değerlendir. Koridor önceliği yoksa nehir savaşını zorlamak yerine gelirini koru.':'İlk dalgada rakibin yetenek tercihlerini gör. Baskın yönünü bilmiyorsan kaçış yeteneğini dalga temizlemek için tüketme.',
    e.some(c=>traits(c).burst)?'Rakibin ana hasar veya kontrol yeteneği boşa çıktığında kısa takas penceresi ara. Yeteneğin geri gelme süresini bilmeden aynı pencerenin sürdüğünü varsayma.':'Takas sırasında kendi minyon kaybını ve rakip minyonların vereceği hasarı hesaba kat. Sadece can üstünlüğü kazanmak için gelirini bırakma.',
    t.scaling?'Erken güç farkında can ve deneyimi koru. Ana eşyan tamamlanmadan uzun dövüşü zorlamak yerine güvenli gelir pencerelerini kullan.':'Üstün takastan sonra dalgayı ve görüşü düzenle; avantajı plansız bir kule altı takibinde harcama.'
  ]});
  return sections;
}

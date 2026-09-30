const {load}=require('cheerio');
const {normalizePatch}=require('./wild-rift-patch.cjs');
const {resolver,normalize}=require('./wild-rift-official.cjs');
const {buildRegistry}=require('./wild-rift-registry.cjs');
const ROLES={Top:'baron',Solo:'baron',Baron:'baron',Jungle:'jungle',Mid:'mid',Dragon:'duo',Duo:'duo',ADC:'duo',Support:'support'};
const BOOTS=new Set('berserkers-greaves boots-of-mana boots-of-dynamism mercurys-treads plated-steelcaps ionian-boots-of-lucidity gluttonous-greaves'.split(' '));
const SPELLS=new Set('Flash Ignite Exhaust Heal Barrier Ghost Smite Cleanse Teleport'.split(' '));
function itemCondition(text){
 if(/reduces?.{0,30}heal|grievous wounds/i.test(text))return 'vs Healing';
 if(/reduces?.{0,30}shield/i.test(text))return 'vs Shielding';
 if(/blocks? an enemy ability|spell shield/i.test(text))return 'vs Crowd Control';
 if(/magic resist|magic damage reduction/i.test(text))return 'vs Magic Damage';
 if(/armor|physical damage reduction/i.test(text))return 'vs Physical Damage';
 if(/critical.{0,30}(?:reduc|less)/i.test(text))return 'vs Critical Strike Damage';
 if(/magic penetration/i.test(text))return 'vs Tanks';
 return 'Source alternative';
}
function parseMetaBuilds(html,champion,data,checkedAt=new Date().toISOString(),url){
 const $=load(html),heading=$('h1').first().text(),patch=normalizePatch(heading.match(/\(\s*(\d+\.\d+[a-z]?)\s*\)/i)?.[1]);
 if(!normalize(heading).includes(normalize(champion.name)+'buildguide'))throw Error('WR-META dizilim şampiyonu doğrulanamadı.');
 if(patch!==data.latestPatch.version)throw Error('WR-META dizilim yaması güncel değil.');
 const resolveBase=resolver(data.items),resolve=name=>resolveBase(({'hextechroketbelt':'Hextech Rocketbelt','dominiksregards':"Lord Dominik's Regard"})[normalize(name)]||name),registry=buildRegistry(data),valid=id=>registry.items[id]?.status==='available'&&registry.items[id].kind!=='component';
 const updatedAt=require('./wild-rift-counter-sources.cjs').sourceDate($),rows=[],rejected=[];
 $('.tabs-b4').each((_,e)=>{
  if($(e).closest('.lock-block').length)return;
  const section=$(e),title=section.find('h2').first().text().trim(),role=({top:'baron',solo:'baron',baron:'baron',jungle:'jungle',mid:'mid',dragon:'duo',duo:'duo',adc:'duo',support:'support'})[title.match(/\b(Top|Solo|Baron|Jungle|Mid|Dragon|Duo|Adc|Support)\b/i)?.[1].toLowerCase()],primary=champion.builds.find(b=>b.role===role);
  if(!/Build items and runes/i.test(title)||!primary||!champion.roles.includes(role))return;
  const group=label=>section.find('.bildtitle2,.bildtitle3').filter((_,n)=>$(n).text().trim()===label).first().parent();
  const ids=node=>node.find('.ico-holder3 > span').map((_,n)=>resolve($(n).text().trim())).get();
  const final=ids(group('Example build'));
  if(final.length!==6||new Set(final).size!==6||final.filter(id=>BOOTS.has(id)).length!==1||final.some(id=>!valid(id))){rejected.push({role,reason:'invalid-six-slots'});return;}
  const core=ids(group('Core')).filter(id=>valid(id)&&!BOOTS.has(id)),starting=ids(group('Start')).filter(id=>registry.items[id]?.status==='available');
  const runes=group('Runes BUILD').find('.newsbox_h_title').map((_,n)=>$(n).text().trim()).get(),spellOptions=group('Summoner Spells').find('.ico-holder3 > span').map((_,n)=>$(n).text().trim()).get().filter(n=>SPELLS.has(n));
  const skillOrder=Array(15).fill(0);
  group('Skills Order').find('.champ-build_abilities_row').each((i,n)=>{if(i>3)return;$(n).find('ul > li').each((level,li)=>{if($(li).hasClass('lit')&&Number($(li).attr('level'))===level+1&&level<15&&!skillOrder[level])skillOrder[level]=i+1;});});
  const situational=[];
  group('Situational items').find('.tabs-b5').each((_,n)=>{if($(n).closest('.lock-block').length)return;const pair=ids($(n)),condition=itemCondition($(n).find('.bildtitle4').text());if(pair.length===2&&pair[0]!==pair[1]&&final.includes(pair[0])&&pair.every(valid))situational.push({items:pair,condition});});
  const runeAlternatives=[];
  group('Situational Runes').find('.tabs-b6').each((_,n)=>{const pair=$(n).find('.ico-holder2 > title').map((_,x)=>$(x).text().trim()).get();if(pair.length===2&&runes.includes(pair[0])&&pair[0]!==pair[1])runeAlternatives.push({from:pair[0],to:pair[1]});});
  const nativeRunes=runes.length===5&&new Set(runes).size===5,nativeSkills=skillOrder.every(Boolean)&&skillOrder.filter(n=>n===4).length===3;
  rows.push({...primary,guideId:'meta-'+role+(rows.some(b=>b.role===role)?'-'+rows.filter(b=>b.role===role).length:''),sourceId:'wrmeta',label:/Shadow Assassin/.test(title)?'Gölge Suikastçısı kaynak seti':/Rhaast/.test(title)?'Rhaast kaynak seti':'WR-META tam kaynak seti',source:url,patch,fetchedAt:checkedAt,updatedAt,basis:'editorial-guide',
   provenance:{patchScope:'page-header',heading:title,sourcePatch:patch,checkedAt},sourceSlotCount:6,final,core:core.length?core:final.filter(id=>!BOOTS.has(id)).slice(0,2),boots:final.filter(id=>BOOTS.has(id)),starting,
   purchaseOrder:final.filter(id=>!BOOTS.has(id)),situational,counters:[],synergies:[],runes:nativeRunes?runes:primary.runes,spells:spellOptions.length>=2?spellOptions.slice(0,2):primary.spells,
   runeSource:nativeRunes?null:primary.source,spellSource:spellOptions.length>=2?url:primary.source,skillSource:nativeSkills?url:primary.source,skillOrder:nativeSkills?skillOrder:primary.skillOrder,
   runeAlternatives:nativeRunes?runeAlternatives:[],spellAlternatives:spellOptions.slice(2)});
 });
 if(!rows.length)throw Error('WR-META kaynağında doğrulanmış altı yuvalı set yok.');
 return {builds:rows,rejected};
}
function parseMetaStatistics(html,champion,checkedAt,url){
 const $=load(html),raw=$('#wrCnFsData[type="application/json"]').text();
 if(!raw||raw.length>100000)return null;
 const dateText=$('.wr-cn-fs-src b').first().text().trim(),time=Date.parse(dateText.replace('UTC','')+' UTC');
 if(!Number.isFinite(time)||time>Date.now()+300000)return null;
 const declared={};$('#wrCnFsBucketSelect option').each((_,e)=>{const rank=({'Diamond +':'diamond','Master +':'master','Challenger':'challenger','Legendary':'apex'})[$(e).text().trim()];if(rank)declared[$(e).attr('value')]=rank;});
 let json;try{json=JSON.parse(raw);}catch{return null;}const rows=[];
 for(const [bucket,entries] of Object.entries(json))if(declared[bucket]&&Array.isArray(entries))for(const entry of entries){
  const role=({TOP:'baron',SOLO:'baron',JUNGLE:'jungle',MID:'mid',DRAGON:'duo',DUO:'duo',ADC:'duo',SUPPORT:'support'})[entry.role_label],values=['win','pick','ban'].map(k=>/^\d+(?:\.\d+)?$/.test(String(entry[k]))?Number(entry[k]):NaN);
  if(!champion.roles.includes(role)||values.some(n=>!Number.isFinite(n)||n<0||n>100)||rows.some(r=>r.role===role&&r.rank===declared[bucket]))continue;
  rows.push({role,rank:declared[bucket],win:values[0],pick:values[1],ban:values[2]});
 }
 // The dataset declares rank and date, but no gameplay patch or sample size.
 // Keep it for comparison; a page heading cannot establish dataset freshness.
 return rows.length?{source:'wrmeta',url,checkedAt,asOf:new Date(time).toISOString(),region:'CN',population:'tencent-cn',patch:null,sampleSize:null,rows}:null;
}
module.exports={parseMetaBuilds,parseMetaStatistics,itemCondition};

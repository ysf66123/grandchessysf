const { load } = require('cheerio');
const { createHash } = require('node:crypto');
const {normalizePatch}=require('./wild-rift-patch.cjs');
const BASE = 'https://www.wildriftfire.com';
const PATCH_URL = 'https://wildrift.leagueoflegends.com/tr-tr/news/tags/patch-notes/';
const roles = { Solo:'baron', Baron:'baron', Jungle:'jungle', Mid:'mid', Duo:'duo', Support:'support' };
const slug = value => String(value).split('/').filter(Boolean).pop();
const hash = value => createHash('sha256').update(value).digest('hex').slice(0,16);
async function fetchText(url) {
  const fs=require('node:fs/promises'),path=require('node:path');
  const directory=process.env.WR_CACHE_DIR||path.join(__dirname,'../.wr-source-cache'),file=path.join(directory,hash(url)+'.json');
  let cached=null;try{cached=JSON.parse(await fs.readFile(file,'utf8'));if(cached.url!==url||typeof cached.text!=='string')cached=null;}catch{}
  const headers={'User-Agent':'Grandmaster-WildRift/1.0 (cached factual game data)'};
  if(cached?.etag)headers['If-None-Match']=cached.etag;
  if(cached?.modified)headers['If-Modified-Since']=cached.modified;
  let response;
  for(let attempt=0;attempt<2;attempt++){
    try{
      response=await fetch(url,{signal:AbortSignal.timeout(20000),headers});
      if(attempt===0&&[408,429,502,503,504].includes(response.status)){await response.body?.cancel();await new Promise(r=>setTimeout(r,1500));continue;}
      break;
    }catch(e){
      if(attempt)throw new Error(`${new URL(url).hostname} kaynağına bağlanılamadı; mevcut veri korunuyor.`);
      await new Promise(r=>setTimeout(r,1500));
    }
  }
  if(response.status===304&&cached)return cached.text;
  if (!response.ok) throw new Error(`Kaynak yanıtı: ${response.status}`);
  const text = await response.text();
  if (text.length > 10000000) throw new Error('Kaynak boyutu beklenenden büyük.');
  const etag=response.headers.get('etag'),modified=response.headers.get('last-modified');
  {try{await fs.mkdir(directory,{recursive:true});await fs.writeFile(file,JSON.stringify({url,etag,modified,text}));}catch{/* Cache failure must not stop a validated refresh. */}}
  return text;
}
function parseStats(html) {
  const $ = load(html), raw = JSON.parse($('#wf-stats-data').text());raw.patch=normalizePatch(raw.patch);
  if (!/^\d+\.\d+[a-z]?$/.test(raw.patch) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.updated)) throw new Error('İstatistik sürümü doğrulanamadı.');
  const brackets = {},missingBrackets=[];
  for (const key of ['diamond','master','challenger','apex']) {
    const rows = raw.brackets?.[key]?.rows;
    if (!Array.isArray(rows)) throw new Error('İstatistik kapsamı eksik.');
    if(rows.length<50){missingBrackets.push(key);continue;}
    brackets[key] = rows.map(r => {
      if (!roles[r.role] || !/^[a-z0-9-]+$/.test(r.slug) || ![r.win,r.pick,r.ban].every(n => Number.isFinite(n) && n>=0 && n<=100)) throw new Error('Geçersiz istatistik satırı.');
      return {id:r.slug,name:r.champion,role:roles[r.role],tier:String(r.tier).toUpperCase().replace('PLUS','+'),win:r.win,pick:r.pick,ban:r.ban};
    });
  }
  if(!brackets.diamond)throw new Error('İstatistik kapsamı eksik.');
  return {patch:raw.patch,asOf:raw.updated,region:'CN',sampleSize:null,source:BASE+'/stats',brackets,missingBrackets};
}
function parseCatalog(html) {
  const $ = load(html), map = new Map();
  $('.wf-tier-list__tiers__main a.ico-holder[data-role]').each((_,e) => {
    const id = slug($(e).attr('href')), role = roles[$(e).attr('data-role')];
    if (!role || !/^[a-z0-9-]+$/.test(id)) return;
    const name = $(e).find('.item-holder img').attr('alt');
    if (!name) return;
    const tierClass = ($(e).closest('.tier').attr('class')||'').split(' ').find(x=>['splus','s','a','b','c'].includes(x));
    const portrait=new URL($(e).find('.item-holder img').attr('src')||'/images/champion/icon/'+id+'.png',BASE);
    if(!['www.wildriftfire.com','www.mobafire.com'].includes(portrait.hostname)||portrait.protocol!=='https:')throw new Error('Şampiyon görseli kaynağı doğrulanamadı.');
    if (!map.has(id)) map.set(id,{id,name,roles:[],tiers:{},guide:BASE+'/guide/'+id,portrait:portrait.href});
    const c=map.get(id); if (!c.roles.includes(role)) c.roles.push(role);
    c.tiers[role]=(tierClass||'').toUpperCase().replace('PLUS','+');
  });
  if (map.size < 80) throw new Error('Şampiyon kataloğu doğrulanamadı.');
  return [...map.values()];
}
function parsePatch(html) {
  const $=load(html), found=[];
  $('a[href*="/news/game-updates/"]').each((_,e)=>{
    const href=$(e).attr('href'), match=href.match(/patch-notes-(\d+)-(\d+)([a-z]?)(?:\/|$)/);
    if (!match) return;
    const date=$(e).find('time').attr('datetime')||null;
    if(date && Date.parse(date)>Date.now())return;
    if(new URL(href,PATCH_URL).hostname!=='wildrift.leagueoflegends.com')return;
    found.push({version:`${match[1]}.${match[2]}${match[3]}`,url:new URL(href,PATCH_URL).href,publishedAt:date});
  });
  if (!found.length) throw new Error('Resmî yama listesi okunamadı.');
  found.sort((a,b)=>comparePatch(b.version,a.version));
  return found[0];
}
function comparePatch(a,b) { const split=s=>s.match(/(\d+)\.(\d+)([a-z]?)/).slice(1); const x=split(a),y=split(b); return +x[0]-+y[0] || +x[1]-+y[1] || x[2].localeCompare(y[2]); }
function parseChampionFacts(html,champion){
 const $=load(html),patch=normalizePatch($('#patch').val()),stats={},keys={'Health':'health','Mana':'mana','Armor':'armor','Magic Res.':'magicResist','Attack Dmg.':'ad','Attack Spd.':'attackSpeed'};
 if(!/^\d+\.\d+[a-z]?$/.test(patch||''))throw Error('Şampiyon nitelik yaması doğrulanamadı.');
 $('.statsBlock.champion .statsBlock__block').each((_,e)=>{const key=keys[$(e).find('.name').text().trim()],node=$(e).find('.value'),base=Number(node.attr('data-base')),growth=Number(node.attr('data-increase'));
  if(key&&Number.isFinite(base)&&Number.isFinite(growth)&&base>=0&&base<=10000&&growth>=0&&growth<=1000)stats[key]={base,growth};
 });
 if(!stats.health||!stats.armor||!stats.magicResist)throw Error('Şampiyon nitelikleri eksik.');
 const abilities=$('.statsBlock').not('.champion').text().replace(/\s+/g,' ');
 const mechanics={};
 if(/fires at a fixed rate|attack speed.{0,20}converted into Attack Damage/i.test(abilities))mechanics.fixedAttackRate=true;
 if(/(?:attacks|basic attacks) deal.{0,90}(?:bonus )?magic damage/i.test(abilities))mechanics.magicOnAttack=true;
 if(/applies? \d+% Grievous Wounds|inflicts? Grievous Wounds/i.test(abilities))mechanics.innateAntiHeal=true;
 if(/\bblinds? the target\b/i.test(abilities))mechanics.blind=true;
 if(/evolve upon fully upgrading an item/i.test(abilities))mechanics.completedItemEvolution=true;
 if(/resets? (?:his |her |their |the )?(?:basic |normal )?attack timer/i.test(abilities))mechanics.attackReset=true;
 if(/can exceed the Attack Speed cap/i.test(abilities))mechanics.attackSpeedCapException=true;
 const capped=abilities.match(/Attack Speed is capped at (\d+(?:\.\d+)?) attacks per second/i);if(capped)mechanics.attackSpeedCap=Number(capped[1]);
 const excess=abilities.match(/(\d+)% of (?:the )?Attack Speed in excess[^.]{0,90}(?:bonus Attack Damage|bonus AD)/i);if(excess)mechanics.excessAttackSpeedConversion=Number(excess[1])/100;
 if(/Critical Rate is doubled/i.test(abilities))mechanics.criticalChanceMultiplier=2;
 const overflow=abilities.match(/converts Critical Rate above 100% into Attack Damage at a rate of (\d+(?:\.\d+)?) Attack Damage per 1%/i);if(overflow)mechanics.criticalOverflowAD=Number(overflow[1]);
 if(/Critical Strikes deal no extra damage/i.test(abilities))mechanics.criticalMode='slow';
 if(/shotgun|Attacks fire \d+ bullets/i.test(abilities))mechanics.criticalMode='pellets';
 if(mechanics.fixedAttackRate)mechanics.criticalMode='fixedShots';
 const abilityFacts=[];
 $('.statsBlock.abilities .statsBlock__block').each((_,e)=>{
  const n=$(e),slot=n.find('.name > span').text().trim(),name=n.find('.name').clone().children().remove().end().text().trim(),text=n.find('.lower').text().replace(/\s+/g,' ');
  if(!['P','1','2','3','4'].includes(slot)||!name||!text)return;
  const flags={};
  if(/\b(?:stun(?:s|ning)?|charm(?:s|ing)?|root(?:s|ing)?|taunt(?:s|ing)?|fear(?:s|ing)?|silenc(?:es|ing)|suppress(?:es|ing)?|immobiliz(?:es|ing)|polymorph(?:s|ing)?)\s+(?:the |an? |all |nearby |enemy|enemies|target|them|for)|\bknock(?:s|ing)? (?:them |enemies |the target |nearby enemies )?(?:up|back|into the air)/i.test(text))flags.control=true;
  if(flags.control&&/\b(?:stun(?:s|ning)?|charm(?:s|ing)?|root(?:s|ing)?|taunt(?:s|ing)?|fear(?:s|ing)?|silenc(?:es|ing))\s+(?:the |an? |all |nearby |enemy|enemies|target|them|for)/i.test(text))flags.cleanseableControl=true;
  if(/\bheals?\s+(?:for|himself|herself|themselves|her|him|them|allies|an? |nearby|the |his |your )|\brestore(?:s)? (?:his |her |their |your )?(?:own )?health\b/i.test(text))flags.heal=true;
  if(/\b(?:gains?|grants?|receive(?:s)?|generates?)\b.{0,90}\bshield\b/i.test(text))flags.shield=true;
  if(/\b(?:dash(?:es)?|blinks?|leaps?)\b/i.test(text))flags.mobility=true;
  if(/(?:basic attacks|attacks) deal.{0,90}(?:bonus )?magic damage/i.test(text))flags.magicOnAttack=true;
  if(/\b(?:on.hit|on hit effects)\b/i.test(text))flags.onHit=true;
  if(/cannot pass through enemy units/i.test(text)||(/first enemy hit|first unit hit|collid(?:es|ing) with/i.test(text)&&!/pierc(?:es|ing)|enemies hit after|subsequent (?:enemies|targets)|other enemies|pass(?:es|ing)? through/i.test(text)))flags.collision=true;
  if(/knock(?:s|ing)? (?:them|enemies|the enemy|nearby enemies) (?:airborne|into the air)/i.test(text))flags.control=true;
  if(/\b(?:fires?|launches?|throws?|sends?)\b.{0,100}\b(?:orb|projectile|bolt|missile|arrow|wave|shot)\b/i.test(text))flags.projectile=true;
  if(/\b(?:targets?|targeted)\s+(?:an? |the )?enemy|\bto an enemy\b|\bthe targeted enemy\b/i.test(text))flags.targeted=true;
  if(/becomes? untargetable|becomes? immune to (?:all )?damage|gains? immunity to (?:all )?damage|becomes? invulnerable/i.test(text))flags.immunity=true;
  if(/immune to (?:all )?(?:crowd control|control effects)|immunity to (?:all )?(?:crowd control|control effects)/i.test(text))flags.controlImmunity=true;
  const controlTypes=[];for(const [key,re] of Object.entries({stun:/\bstun(?:s|ning)?\b/i,root:/\broot(?:s|ing)?\b/i,charm:/\bcharm(?:s|ing)?\b/i,fear:/\bfear(?:s|ing)?\b/i,taunt:/\btaunt(?:s|ing)?\b/i,silence:/\bsilenc(?:es|ing)\b/i,polymorph:/\bpolymorph(?:s|ing)?\b/i,suppression:/\bsuppress(?:es|ing|ion)?\b/i,airborne:/knock.{0,30}(?:up|back|into the air)|airborne/i}))if(flags.control&&re.test(text))controlTypes.push(key);
  const damageTypes=['physical','magic','true'].filter(type=>new RegExp('\\b'+type+' damage\\b','i').test(text));
  const cooldown=n.find('.cooldown > span').map((_,x)=>Number($(x).text().trim())).get().filter(v=>Number.isFinite(v)&&v>0&&v<=300);
  const formTitle=n.closest('.statsBlock.abilities').parent().find('.statsBlock.champion h2').first().text();
  const form=/Shadow Assassin/i.test(formTitle)?'shadow':/Rhaast/i.test(formTitle)?'darkin':null;
  abilityFacts.push({slot,name,flags,controlTypes,damageTypes,damagePackets:require('./wild-rift-semantics.cjs').damagePackets(text),...(form?{form}:{}),...(cooldown.length&&cooldown.length<=4?{baseCooldown:cooldown}:{})});
 });
 if(abilityFacts.some(a=>a.flags.onHit))mechanics.onHit=true;
 if(abilityFacts.some(a=>a.flags.heal))mechanics.heal=true;
 if(abilityFacts.some(a=>a.flags.shield))mechanics.shield=true;
 if(abilityFacts.some(a=>a.flags.control))mechanics.control=true;
 const tags=$('.wf-champion__about__tags__tag').map((_,e)=>$(e).text().trim()).get(),declaredModes=new Set();
 for(const tag of tags)if(/^(?:Melee|Ranged)(?:\s*\/\s*(?:Melee|Ranged))?$/i.test(tag))for(const mode of tag.split('/'))declaredModes.add(mode.trim().toLowerCase());
 // Form descriptions are explicit attack modes, not references to an enemy's range.
 if(/gaining melee attacks/i.test(abilities)&&/gaining ranged attacks/i.test(abilities)){declaredModes.add('melee');declaredModes.add('ranged');}
 if(declaredModes.size){mechanics.rangeModes=[...declaredModes];mechanics.rangeMode=declaredModes.size===1?[...declaredModes][0]:'variable';}
 return {patch,checkedAt:new Date().toISOString(),source:champion.guide,provenance:{patchScope:'champion-ability-panel',sourcePatch:patch},abilityFacts,stats,usesMana:!!stats.mana,trueDamage:/\btrue damage\b/i.test(abilities),mechanics};
}
function parseGuide(html,champion) {
  const $=load(html), patch=normalizePatch($('#patch').val());
  if (!/^\d+\.\d+[a-z]?$/.test(patch||'')) throw new Error('Dizilim sürümü bulunamadı.');
  const items={};
  const names = element => $(element).find('.ico-holder').map((_,e)=>{
    const name=$(e).find('.name').first().text().trim(), src=$(e).find('img').first().attr('src');
    if (!name || !src?.includes('/items/')) return null;
    const id=slug(src).replace(/\.png.*$/,'');
    if (!/^[a-z0-9-]+$/.test(id)) return null;
    items[id]={id,name,icon:new URL(src,BASE).href}; return id;
  }).get();
  const builds=[];
  $('.wf-champion__data__items[data-guide-id]').each((_,e)=>{
    const guideId=$(e).attr('data-guide-id');
    const related=selector=>$(selector).filter((_,x)=>$(x).attr('data-guide-id')===guideId);
    const roleNode=$(`[data-guide-id="${guideId}"]`).filter((_,x)=>$(x).attr('data-role') || $(x).attr('data-lane')).first();
    const tabRole=$(`span[data-guide-id="${guideId}"]`).first().text().trim().split(/\s+/)[0];
    const role=roles[roleNode.attr('data-role')||roleNode.attr('data-lane')] || roles[tabRole] || (champion.roles.length===1?champion.roles[0]:null);
    const final=names($(e).find('.section.final'));
    const sourceSlotCount=final.length;
    if (final.length<6 || final.length>7 || new Set(final).size!==final.length) throw new Error(`${champion.name}: tam dizilim doğrulanamadı.`);
    const situational=related('.wf-champion__data__situational').find('.section.situation').map((_,x)=>({condition:$(x).find('span.situation').text().trim(),items:names(x)})).get();
    // Since 7.2, former enchants are full items. Some guides still append one
    // to six occupied slots; retain it as a replacement, never a seventh slot.
    if(final.length===7)situational.push({condition:'Active item alternative',items:[final[5],final.pop()]});
    const spells=related('.wf-champion__data__spells');
    const skills=related('.skills-counters-block');
    const skillOrder=Array.from({length:15},(_,i)=>Number(skills.find(`li.lit[level="${i+1}"]`).closest('ul').attr('data-row'))||null);
    const counters=skills.find('.counters a[href^="/guide/"]').map((_,x)=>slug($(x).attr('href'))).get();
    const synergies=skills.find('.synergies a[href^="/guide/"]').map((_,x)=>slug($(x).attr('href'))).get();
    builds.push({role,guideId,patch,updatedAt:require('./wild-rift-counter-sources.cjs').sourceDate($),source:champion.guide,sourceSlotCount,starting:names($(e).find('.section.starting')),core:names($(e).find('.section.core')),boots:names($(e).find('.section.boots')),final,situational,
      spells:spells.find('.section.spells .name').map((_,x)=>$(x).text().trim()).get(),runes:spells.find('.section.runes .name').map((_,x)=>$(x).text().trim()).get(),skillOrder,counters,synergies});
  });
  if (!builds.length) throw new Error('Şampiyon rehberi eksik.');
  const tags=$('.wf-champion__about__tags').first().find('span').map((_,x)=>$(x).text().trim()).get();
  let combatFacts;try{combatFacts=parseChampionFacts(html,champion);}catch{}
  return {builds,items,tags,combatFacts,contentHash:hash(JSON.stringify({builds,items,tags,combatFacts:combatFacts?{...combatFacts,checkedAt:undefined}:null})),fetchedAt:new Date().toISOString()};
}
function parseItemCatalog(html){
  const $=load(html),patch=normalizePatch($('title').text().match(/Patch (\d+\.\d+[a-z]?)/i)?.[1]),entries=new Map();
  if(!patch)throw Error('Eşya kataloğunun yaması bulunamadı.');
  $('.ico-holder[data-id]').each((_,e)=>{
    const src=$(e).find('img[src*="/items/"]').first().attr('src'),sourceId=Number($(e).attr('data-id'));
    if(!src||!Number.isInteger(sourceId)||sourceId<1)return;
    const id=slug(src).replace(/\.png.*$/,'');if(!/^[a-z0-9-]+$/.test(id))return;
    const name=$(e).find('.name').first().text().trim()||$(e).children('span').first().text().trim();
    entries.set(id,{id,sourceId,name:name||id,icon:new URL(src,BASE).href,categories:($(e).attr('data-sort')||'').split(',').filter(Boolean)});
  });
  if(entries.size<50)throw Error('Eşya kataloğu eksik.');
  return {patch,entries:[...entries.values()],source:BASE+'/item-list'};
}
function parseEffectText(text){
  const effects={},mechanics={};
  const patterns={antiHeal:/\bGrievous Wounds\b/i,antiShield:/shield reduction|reduces? (?:any |all |their )?shields?/i,stasis:/\bstasis\b/i,revive:/\bresurrect|\brevive/i,spellShield:/spell shield|blocks? the next (?:hostile |enemy )?ability/i,cleanse:/removes? (?:all )?(?:crowd control|immobilizing)/i,critReduction:/Critical Strikes deal \d+% less damage/i,attackReduction:/Basic attacks from champions deal \d+% reduced damage/i,sustain:/\b(?:Physical Vamp|Omnivamp|Lifesteal|Life Steal)\b/i,shield:/\b(?:gain|grants?|generates?|receive)(?:\s+\w+){0,8}\s+(?:a\s+)?shield\b/i};
  for(const [key,pattern] of Object.entries(patterns))if(pattern.test(text))effects[key]=true;
  if(effects.revive){delete effects.stasis;mechanics.defense={kind:'revive',activation:'lethal',recipient:'self'};}
  else if(effects.stasis&&/become immune to damage|untargetable/i.test(text))mechanics.defense={kind:'stasis',activation:'manual',recipient:'self'};
  else if(effects.cleanse){mechanics.defense={kind:'cleanse',activation:'manual',recipient:/target champion/i.test(text)?'ally':'self',excluded:[]};if(/except suppression/i.test(text))mechanics.defense.excluded.push('suppression');if(/except.{0,40}(?:airborne|knock)/i.test(text))mechanics.defense.excluded.push('airborne');}
  else if(effects.spellShield)mechanics.defense={kind:'spellShield',activation:'nextAbility',recipient:'self'};
  const critical=text.match(/Critical strike damage increased from \d+% to (\d+)%/i);if(critical)mechanics.criticalMultiplier=Number(critical[1])/100;
  if(effects.antiHeal)mechanics.antiHeal=/physical damage (?:dealt|to)|dealing physical damage/i.test(text)?'physicalDamage':/dealing magic damage/i.test(text)?'magicDamage':/when struck.*or dealing damage/i.test(text)?'damageOrIncomingAttack':/when (?:struck|hit) by (?:a |an )?(?:basic |normal )?attack/i.test(text)?'incomingAttack':/dealing damage|damage dealt/i.test(text)?'damage':'unknown';
  if(effects.antiShield)mechanics.antiShield=/dealing ability damage/i.test(text)?'abilityDamage':/dealing damage|when you damage/i.test(text)?'damage':'unknown';
  if(/(?:enemy|target).{0,20}max(?:imum)? Health/i.test(text))mechanics.healthDamage='maximum';
  else if(/target.{0,15}current Health/i.test(text))mechanics.healthDamage='current';
  if(/basic attacks deal.{0,45}(?:on.hit|target.{0,15}current Health)/i.test(text))mechanics.onHit=true;
  if(/melee.{0,150}ranged|ranged.{0,150}melee/i.test(text))mechanics.rangeDependent=true;
  if(/Area of effect.{0,200}single target/i.test(text))mechanics.areaDependent=true;
  if(/Spellblade/i.test(text))mechanics.spellblade=true;
  if(/\bonly (?:usable|available) (?:by|for) melee|\bmelee only\b/i.test(text))mechanics.restriction='melee';
  if(/\bonly (?:usable|available) (?:by|for) ranged|\branged only\b/i.test(text))mechanics.restriction='ranged';
  if(/(?:basic attacks|attacks).{0,60}(?:stacking up to|at max stacks|stacks)/i.test(text))mechanics.requiresAttacks=true;
  if(/heal(?:ing)? or shield(?:ing)?.{0,90}(?:allied|ally)|shielding or healing an allied/i.test(text))mechanics.allyProtection=true;
  return {effects,mechanics};
}
function parseItemDetails(html,entry){
  const $=load(html),image=$('.tt__image img').attr('src'),id=slug(image||'').replace(/\.png.*$/,'');
  const raw=$('.tt__info__cost span').first().text().trim();
  if(id!==entry.id||!/^\d{2,5}$/.test(raw))throw Error('Eşya kimliği veya fiyatı doğrulanamadı.');
  const cost=Number(raw);if(cost<100||cost>10000)throw Error('Eşya fiyatı aralık dışında.');
  const stats={},keys={'Armor':'armor','Magic Resistance':'magicResist','Magic Resist':'magicResist','Critical Strike Chance':'crit','Health':'health','Mana':'mana','Attack Damage':'ad','Ability Power':'ap','Attack Speed':'attackSpeed','Ability Haste':'haste','Armor Penetration':'armorPen','Magic Penetration':'magicPen','Physical Vamp':'physicalVamp','Omnivamp':'omniVamp','Lifesteal':'lifesteal'};
  $('.tt__info__stats > span').each((_,e)=>{
    const value=$(e).find('span').first().text().trim(),label=$(e).clone().children().remove().end().text().trim(),key=keys[label];
    if(key&&/^\+?\d+(?:\.\d+)?%?$/.test(value)){const n=Number(value.replace(/[+%]/g,''));if(n>=0&&n<=2000)stats[key]=n;}
  });
  const text=$('.tt__info').text().replace(/\s+/g,' '),passives=[];
  $('.tt__info__uniques > span').each((_,e)=>{
    const raw=$(e).html().replace(/<br\s*\/?\s*>/gi,'\n');
    const plain=load('<div>'+raw+'</div>')('div').first().text();
    for(const text of plain.split(/\n\s*\n(?=[A-Z][\w ’'-]{1,45}:)/)){
     const title=text.trim().match(/^(?:UNIQUE(?: -)? )?([^:]{1,55}?)(?::|\s-\s)/i)?.[1];if(!title)continue;
     const facts=parseEffectText(text);
     passives.push({key:title.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),effects:facts.effects,mechanics:facts.mechanics,...require('./wild-rift-semantics.cjs').passiveFacts(text)});
    }
  });
  return {cost,stats,passives,...parseEffectText(text),costSource:BASE+`/ajax/tooltip?relation_type=Item&relation_id=${entry.sourceId}&lang=en`};
}
module.exports={BASE,PATCH_URL,fetchText,parseStats,parseCatalog,parsePatch,parseGuide,parseChampionFacts,parseItemCatalog,parseItemDetails,parseEffectText,comparePatch,hash};

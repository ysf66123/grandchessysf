const {load}=require('cheerio'),{hash}=require('./wild-rift-source.cjs');
const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const BOOTS={
 'boots-of-mana':['spellslingers-shoes',"Spellslinger's Shoes"],
 'mercurys-treads':['chainlaced-crushers','Chainlaced Crushers'],
 'berserkers-greaves':['gunmetal-greaves','Gunmetal Greaves'],
 'plated-steelcaps':['armored-advance','Armored Advance'],
 'gluttonous-greaves':['immortal-treads','Immortal Treads'],
 'boots-of-dynamism':['armorcrusher-boots','Armorcrusher Boots'],
 'ionian-boots-of-lucidity':['crimson-lucidity','Crimson Lucidity']
};
const PATCHES=['7.2','7.2a','7.2b','7.2c','7.2d','7.2e','7.3','7.3a'];
const patchUrl=p=>'https://wildrift.leagueoflegends.com/en-us/news/game-updates/wild-rift-patch-notes-'+(p==='7.2e'?'72e':p.replace('.','-'))+'/';
function article(html){const $=load(html);$('script,style,nav,footer').remove();return { $,text:($('article').text()||$('body').text()).replace(/\s+/g,' ')};}
function patchImpact(html,data,url,checkedAt){
 const {$,text}=article(html),declared=$('h1').first().text().match(/Patch Notes\s+(\d+\.\d+[a-z]?)/i)?.[1]?.toLowerCase();
 if(declared!==data.latestPatch.version)throw Error('Yama etki sürümü uyuşmuyor.');
 const main=text.split(/GAME MODE CHANGES|SYSTEM CHANGES|Related Articles/)[0],champions=[],items=[];
 const nodes=$('h2,h3,h4,p,strong,[data-testid="character-name"]').map((i,e)=>$(e).text().trim()).get();
 const declaredChampions=$('[data-testid^="character-changes-"]').map((i,e)=>$(e).attr('data-testid').replace('character-changes-','')).get();
 const champEnd=main.search(/GAMEPLAY CHANGES|ITEM ADJUSTMENTS|Item Adjustments/),champText=champEnd>0?main.slice(0,champEnd):main;
 const itemText=champEnd>0?main.slice(champEnd):main;
 for(const c of data.champions)if([...nodes,...declaredChampions].some(n=>normalize(n)===normalize(c.name))&&new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(champText))champions.push(c.id);
 for(const item of Object.values(data.items))if(nodes.some(n=>normalize(n)===normalize(item.name))&&itemText.includes(item.name))items.push(item.id);
 return {schema:1,patch:declared,checkedAt,url,contentHash:hash(main),champions,items,scopeVerified:/CHAMPION|GAMEPLAY CHANGES|ITEM/i.test(main),ruleVersion:'7.3a-model1'};
}
function bootSections(html){
 const {$}=article(html),sections={};
 for(const h of $('h3,h4').toArray()){
  const heading=$(h).text(),parent=Object.keys(BOOTS).find(p=>heading.includes(BOOTS[p][1]));if(!parent)continue;
  let text=$(h).nextUntil('h2,h3,h4').text().replace(/\s+/g,' ');
  const embedded=Object.entries(BOOTS).filter(([p])=>p!==parent).map(([p,[,name]])=>({p,name,index:text.indexOf(name)})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index);
  sections[parent]=text.slice(0,embedded[0]?.index??text.length);
  for(let i=0;i<embedded.length;i++)sections[embedded[i].p]=text.slice(embedded[i].index+embedded[i].name.length,embedded[i+1]?.index??text.length);
 }
 return sections;
}
function parseBootChain(pages,patch,checkedAt){
 if(!PATCHES.includes(patch)||pages.length!==PATCHES.indexOf(patch)+1)throw Error('Bot yama zinciri eksik.');
 const byParent={},keys={'Ability Power':'ap','Attack Damage':'ad','Attack Speed':'attackSpeed','Max Health':'health','Armor':'armor','Magic Resist':'magicResist','Magic Resistance':'magicResist','Ability Haste':'haste','Mana Regen':'manaRegen','Magic Penetration':'magicPen','Armor Penetration':'armorPen','Lifesteal':'lifesteal','Physical Vamp':'physicalVamp'};
 for(let i=0;i<pages.length;i++){
  const page=pages[i],{$,text}=article(page.html);if($('h1').first().text().match(/Patch Notes\s+(\d+\.\d+[a-z]?)/i)?.[1]?.toLowerCase()!==PATCHES[i])throw Error('Bot yama belgesi uyuşmuyor.');
  if(i===0&&!/10.minutes|10 minutes|10:00/i.test(text))throw Error('Bot açılma zamanı doğrulanamadı.');
  for(const [parent,section] of Object.entries(bootSections(page.html))){
   const [id,name]=BOOTS[parent],record=byParent[parent]||{id,name,parent,unlockMinutes:10,stats:{},changes:[]};
   const price=section.match(/Price:\s*(?:\d+\s*→\s*)?(\d+)/i);if(price)record.cost=Number(price[1]);
   const path=section.match(/Build Path:\s*.+?\((\d+)\)\s*\+\s*(\d+)/i);if(path){record.parentCost=Number(path[1]);record.fee=Number(path[2]);}
   for(const [label,key] of Object.entries(keys)){
    const re=new RegExp('(\\[Removed\\]\\s*)?'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':\\s*(\\d+(?:\\.\\d+)?%?(?:\\s*→\\s*\\d+(?:\\.\\d+)?%?)?)','gi');
    for(const m of section.matchAll(re))record.stats[key]=m[1]?0:Number(m[2].split('→').pop().trim().replace('%',''));
   }
   record.changes.push({patch:PATCHES[i],url:page.url});
   record.mechanics=record.mechanics||{};
   const minion=section.match(/additional (\d+) true damage to minions|True Damage:\s*\d+\s*→\s*(\d+)/i);if(minion)record.mechanics.minionTrueDamage=Number(minion[1]||minion[2]);
   const movement=section.match(/gain (\d+)% \(melee\)\s*\/\s*(\d+)% \(ranged\).*?for (\d+) seconds/i);if(movement)record.mechanics.movementProc={melee:Number(movement[1]),ranged:Number(movement[2]),duration:Number(movement[3])};
   const movementChange=section.match(/Movement Speed:\s*\d+\s*\/\s*\d+%.*?→\s*(\d+)\s*\/\s*(\d+)%/i);if(movementChange&&record.mechanics.movementProc)Object.assign(record.mechanics.movementProc,{melee:Number(movementChange[1]),ranged:Number(movementChange[2])});
   const shield=section.match(/(magic|physical) shield equal to (\d+)\s*-\s*(\d+).*?\+\s*(\d+)% of your max Health/i);if(shield)record.mechanics.damageShield={type:shield[1],baseByLevel:[Number(shield[2]),Number(shield[3])],maxHealthRatio:Number(shield[4])/100,cooldown:12};
   const basicReduction=section.match(/Basic attacks from champions deal (\d+)% reduced damage/i);if(basicReduction)record.mechanics.attackReductionPercent=Number(basicReduction[1]);
   record.effects={...record.effects,...require('./wild-rift-source.cjs').parseEffectText(section).effects};
   // Numeric shield/health values remain conditional facts, not permanent stats.
   record.passives=record.passives||[];
   if(i===0&&/12.second cooldown/i.test(section))record.passives.push({key:'damage-shield',trigger:'incomingDamage',cooldown:12,uptime:'conditional',conditions:['damageType']});
   if(i===0&&parent==='gluttonous-greaves')record.passives.push({key:'adaptive-vamp',trigger:'takedown',uptime:'conditional',conditions:['healthThreshold'],maxStacks:10});
   byParent[parent]=record;
  }
 }
 if(Object.keys(byParent).length!==7||Object.values(byParent).some(r=>!Number.isInteger(r.cost)||r.cost!==r.parentCost+r.fee||r.fee<0))throw Error('Bot fiyatı veya tarifi eksik.');
 return {schema:1,patch,checkedAt,reviewedPatches:PATCHES.slice(0,pages.length),sources:pages.map(p=>p.url),byParent};
}
async function refreshModelEvidence(data,fetchPage,checkedAt=new Date().toISOString()){
 const currentUrl=patchUrl(data.latestPatch.version);
 try{const html=await fetchPage(currentUrl);data.patchImpact=patchImpact(html,data,currentUrl,checkedAt);await require('./wild-rift-combat-review.cjs').refreshCombatReview(data,()=>html,checkedAt);}catch{data.patchImpact={patch:data.latestPatch.version,checkedAt,scopeVerified:false,champions:[],items:[],ruleVersion:null};}
 if(!PATCHES.includes(data.latestPatch.version)){data.bootUpgrades={patch:data.latestPatch.version,checkedAt,byParent:{},error:'Yeni yama için bot kuralları yeniden doğrulanmalı.'};return;}
 try{
  const pages=[];for(const patch of PATCHES.slice(0,PATCHES.indexOf(data.latestPatch.version)+1)){const url=patchUrl(patch);pages.push({url,html:await fetchPage(url)});}
  data.bootUpgrades=parseBootChain(pages,data.latestPatch.version,checkedAt);
  for(const r of Object.values(data.bootUpgrades.byParent)){
   const item=data.items[r.id]||{id:r.id,name:r.name,icon:null};
   item.upgradeParent=r.parent;item.official={id:r.id,name:r.name,patch:data.latestPatch.version,checkedAt,cost:r.cost,stats:r.stats,source:'riot',url:data.bootUpgrades.sources[0],basePatch:'7.2',reviewedThrough:currentUrl,reviewedSources:data.bootUpgrades.sources,recipe:{components:[r.parent],fee:r.fee}};
   Object.assign(item,{effects:r.effects,effectsPatch:data.latestPatch.version,effectsCheckedAt:checkedAt,mechanics:r.mechanics,mechanicsPatch:data.latestPatch.version,mechanicsCheckedAt:checkedAt,passives:r.passives,passivesPatch:data.latestPatch.version,passivesCheckedAt:checkedAt});
   data.items[r.id]=item;
  }
 }catch{data.bootUpgrades={patch:data.latestPatch.version,checkedAt,byParent:{},error:'Bot fiyatı, tarifi veya yama zinciri eksik; otomatik alışverişe katılmıyor.'};}
}
module.exports={patchImpact,bootSections,parseBootChain,refreshModelEvidence,patchUrl,BOOTS};

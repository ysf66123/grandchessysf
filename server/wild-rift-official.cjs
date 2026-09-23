const {load}=require('cheerio');
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ALIASES={atwitsend:'wits-end',staffofflowingwaters:'staff-of-flowing-water',lorddominiksregards:'lord-dominiks-regard',steraksgage:'steraks-gage',yordletrap:'yordle-trap',bfsword:'bf-sword',vampiricscepterscepter:'vampiric-scepter'};
function resolver(items){const index=new Map(Object.values(items).flatMap(i=>[[normalize(i.name),i.id],[normalize(i.id),i.id]]));return name=>index.get(normalize(name))||ALIASES[normalize(name)]||String(name).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function parseOfficialItems(html,items,patch,url,checkedAt=new Date().toISOString()){
  const $=load(html),resolve=resolver(items),facts={},removed=[];
  const declared=$('h1').first().text().match(/Patch Notes (\d+\.\d+[a-z]?)/)?.[1];
  if(declared!==patch)throw Error('Resmî eşya yaması doğrulanamadı.');
  for(const heading of $('h3,h4').toArray()){
    const name=$(heading).text().trim(),section=$(heading).nextUntil('h2,h3,h4');
    if(/^(?:Items )?Removed$/i.test(name)){
      section.find('li').filter((_,e)=>!$(e).find('li').length).each((_,e)=>{const text=$(e).text().trim();if(text.length<65&&!/[.!]/.test(text))removed.push(resolve(text));});continue;
    }
    // Only item sections containing a build path or price; champion stats are not item facts.
    const lines=section.find('li').map((_,e)=>$(e).text().replace(/\s+/g,' ').trim()).get();
    const pathLine=lines.find(t=>/Build Path:/i.test(t)),priceLine=lines.find(t=>/^(?:\[New\]\s*)?(?:Total )?Price:/i.test(t));
    if(!pathLine&&!priceLine)continue;
    const id=resolve(name);if(!/^[a-z0-9-]+$/.test(id))continue;
    const fact={id,name,source:'riot',url,patch,checkedAt,stats:{}};
    if(priceLine){const value=priceLine.split('→').pop().split(':').pop().trim();if(/^\d+$/.test(value))fact.cost=Number(value);}
    if(pathLine){
      const value=pathLine.split('→').pop().replace(/^.*Build Path:\s*/i,'').trim(),tokens=value.split(/\s*\+\s*/),components=[];let fee=0,valid=true;
      for(const token of tokens){const match=token.match(/^(.+?)\s*\((\d+)\)$/);if(match)components.push({id:resolve(match[1]),name:match[1],cost:Number(match[2])});else if(/^\d+$/.test(token))fee+=Number(token);else valid=false;}
      if(valid&&components.length){const total=components.reduce((n,c)=>n+c.cost,fee);if(total>=100&&total<=10000&&(!fact.cost||total===fact.cost)){fact.cost=total;fact.recipe={components:components.map(c=>c.id),fee};fact.componentFacts=components;}else fact.recipeConflict=true;}
    }
    const keys={'Armor':'armor','Magic Resist':'magicResist','Magic Resistance':'magicResist','Critical Rate':'crit','Critical Strike Chance':'crit','Attack Damage':'ad','Ability Power':'ap','Health':'health','Max Health':'health','Attack Speed':'attackSpeed','Ability Haste':'haste','Armor Penetration':'armorPen'};
    for(const line of lines){const match=line.match(/^(\[Removed\]\s*)?(?:\[New\]\s*)?([^:]+):\s*(.*)$/);if(!match||!keys[match[2]])continue;const value=match[3].split('→').pop().trim();if(match[1])fact.stats[keys[match[2]]]=0;else if(/^\d+(?:\.\d+)?%?$/.test(value))fact.stats[keys[match[2]]]=Number(value.replace('%',''));}
    if(fact.cost||fact.recipe)facts[id]=fact;
  }
  if(Object.keys(facts).length<3)throw Error('Resmî eşya değişiklikleri okunamadı.');
  return {patch,source:url,checkedAt,items:facts,removed:[...new Set(removed)]};
}
function applyOfficial(data,official){
  for(const fact of Object.values(official.items)){
    const item=data.items[fact.id]||{id:fact.id,name:fact.name,icon:null};
    item.official={...fact};delete item.official.componentFacts;
    if(fact.cost)Object.assign(item,{cost:fact.cost,costSource:fact.url,costPatch:official.patch,costCheckedAt:official.checkedAt});
    item.stats={...item.stats,...fact.stats};data.items[fact.id]=item;
    for(const component of fact.componentFacts||[]){
      const c=data.items[component.id]||{id:component.id,name:component.name,icon:null};
      if(!c.official?.cost)Object.assign(c,{cost:component.cost,costPatch:official.patch,costCheckedAt:official.checkedAt,costSource:fact.url,official:{id:c.id,cost:component.cost,patch:official.patch,checkedAt:official.checkedAt,url:fact.url,source:'riot'}});
      data.items[c.id]=c;
    }
  }
  for(const id of official.removed)if(data.items[id])data.items[id].removedIn=official.patch;
  data.official={patch:official.patch,url:official.source,checkedAt:official.checkedAt,removed:official.removed,itemCount:Object.keys(official.items).length};
}
module.exports={parseOfficialItems,applyOfficial,resolver,normalize};

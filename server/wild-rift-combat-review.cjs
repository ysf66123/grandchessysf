const {load}=require('cheerio'),{hash}=require('./wild-rift-source.cjs');
const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const numbers=s=>(String(s).match(/\d+(?:\.\d+)?/g)||[]).map(Number);
const equal=(a,b)=>a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<.00001);
function reviewChampionPatch(html,data,url,checkedAt=new Date().toISOString()){
 const $=load(html),patch=$('h1').first().text().match(/Patch Notes\s+(\d+\.\d+[a-z]?)/i)?.[1]?.toLowerCase();
 if(patch!==data.latestPatch.version)throw Error('Şampiyon doğrulama yaması uyuşmuyor.');
 const reviews={};
 for(const el of $('[data-testid^="character-changes-"]').toArray()){
  const champion=data.champions.find(c=>norm(c.name)===norm($(el).find('[data-testid=character-name]').first().text()));if(!champion)continue;
  const f=champion.combatFacts;if(!f||f.patch!==patch)continue;
  const stats=[],attack=[],abilities=[];
  for(const block of $(el).find('.character-change').toArray()){
   const name=$(block).find('[data-testid=character-ability-title]').text().trim();
   for(const li of $(block).find('[data-testid=character-change-body] li').toArray()){
    const text=$(li).text().replace(/\s+/g,' ').trim(),parts=text.split(/→|->/);if(parts.length!==2)continue;
    const label=parts[0].split(/[:：]/)[0].trim(),values=numbers(parts[1]);
    if(/base stats/i.test(name)){
     const attackKey=/^Attack Speed per level(?:\s|\d|$)/i.test(label)?'growth':/^Attack Speed ratio(?:\s|\d|$)/i.test(label)?'ratio':/^Base Attack Speed(?:\s|\d|$)/i.test(label)?'base':/^Base Bonus Attack Speed(?:\s|\d|$)/i.test(label)?'baseBonus':null;
     if(attackKey&&values.length===1){const sourceValue=data.attackRules?.byChampion?.[champion.id]?.[attackKey];attack.push({key:attackKey,current:values[0],sourceValue,status:sourceValue===values[0]?'verified':'conflict'});continue;}
     const key=/^Health/i.test(label)?'health':/^Armor/i.test(label)?'armor':/^Magic Res/i.test(label)?'magicResist':/^Attack Damage$/i.test(label)?'ad':null;
     if(!key||values.length!==1)continue;
     const part=/per level/i.test(label)?'growth':'base',sourceValue=f.stats[key]?.[part];
     stats.push({key,part,current:values[0],sourceValue,status:sourceValue===values[0]?'verified':'conflict'});continue;
    }
    if(!/damage|cooldown|ability power ratio|attack damage ratio|armor ratio/i.test(label))continue;
    const matches=(f.abilityFacts||[]).filter(a=>norm(a.name)===norm(name));let status='unmapped';
    if(matches.length===1){
     const a=matches[0],ps=(a.damagePackets||[]).filter(p=>p.parsed);
     if(/^Cooldown$/i.test(label))status=equal(a.baseCooldown||[],values)?'verified':'conflict';
     else if(/^(?:Bonus )?(?:Attack Damage|Ability Power|Armor)(?: Damage)? ratio$/i.test(label)&&ps.length===1){
      const stat=/Ability Power/i.test(label)?'ap':/Armor/i.test(label)?'armor':'ad',ratios=ps[0].scalings.filter(r=>r.stat===stat&&(!/^Bonus/i.test(label)||r.bonus));
      status=ratios.length===1&&equal(ratios[0].coefficients,values.map(n=>n/100))?'verified':'conflict';
     }else if(/^Damage$/i.test(label)&&ps.length===1&&!/Based on level|Health|Critical|\bAD\b|Attack Damage/i.test(parts[1])){
      const base=numbers(parts[1].split('+')[0]),ap=parts[1].match(/(\d+(?:\.\d+)?)%\s*(?:Ability Power|AP)/i),r=ps[0].scalings.filter(r=>r.stat==='ap');
      status=equal(ps[0].baseValues||[],base)&&(!ap||r.length===1&&equal(r[0].coefficients,[Number(ap[1])/100]))?'verified':'conflict';
     }else status='conditional';
    }
    abilities.push({name,label,values,slots:matches.map(a=>a.slot),status,numericExcluded:status!=='verified'&&!/^Cooldown$/i.test(label)});
   }
  }
  reviews[champion.id]={patch,checkedAt,url,stats,attack,abilities};
 }
 if(!Object.keys(reviews).length)throw Error('Resmî şampiyon değişiklikleri okunamadı.');
 return {schema:1,patch,checkedAt,url,contentHash:hash(html),champions:reviews};
}
async function refreshCombatReview(data,fetchPage,checkedAt=new Date().toISOString()){
 const url=require('./wild-rift-model-update.cjs').patchUrl(data.latestPatch.version);
 try{data.combatReview=reviewChampionPatch(await fetchPage(url),data,url,checkedAt);}catch(e){
  if(data.combatReview?.patch===data.latestPatch.version)data.combatReview={...data.combatReview,refreshError:e.message};
  else data.combatReview={patch:data.latestPatch.version,champions:{},refreshError:e.message};
 }
 return data.combatReview;
}
module.exports={reviewChampionPatch,refreshCombatReview};

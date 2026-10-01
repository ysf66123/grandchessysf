function numericItemMechanics(text,stats={},units={}){
 const penetration=[];
 for(const [key,channel] of [['armorPen','physical'],['magicPen','magic']])if(Number.isFinite(stats[key])&&units[key])penetration.push({channel,kind:units[key]==='percent'?'percentPen':'flatPen',value:units[key]==='percent'?stats[key]/100:stats[key],trigger:'permanent'});
 for(const m of text.matchAll(/(?:\+?)(\d+(?:\.\d+)?)\s*(%?)\s+(Armor|Magic) penetration/gi)){
  if(m[2])continue;const channel=m[3].toLowerCase()==='armor'?'physical':'magic',value=Number(m[1]);
  if(!penetration.some(p=>p.channel===channel&&p.kind==='flatPen'&&p.value===value))penetration.push({channel,kind:'flatPen',value,trigger:'permanent'});
 }
 const reduce=text.match(/(?:reduce their Magic Resist by|reduces their Armor by) (\d+(?:\.\d+)?)%[\s\S]{0,100}?stacking up to (?:(\d+) times for )?(\d+(?:\.\d+)?)%/i);
 if(reduce){const step=Number(reduce[1])/100,max=Number(reduce[3])/100;penetration.push({channel:/Magic Resist/i.test(reduce[0])?'magic':'physical',kind:'percentReduction',value:max,perStack:step,maxStacks:Number(reduce[2])||Math.round(max/step),trigger:/abilities or passives deal magic/i.test(text)?'magicAbility':'physicalDamage'});}
 const dark=text.match(/dark effect grants (\d+)% Armor Penetration and Magic Penetration, stacking up to (\d+) times/i);
 if(dark)for(const channel of ['physical','magic'])penetration.push({channel,kind:'percentPen',value:Number(dark[1])*Number(dark[2])/100,perStack:Number(dark[1])/100,maxStacks:Number(dark[2]),trigger:'alternatingAttacks',cycleVerified:false});
 const growth={};
 const crit=text.match(/gaining (\d+(?:\.\d+)?)%\s*\/\s*(\d+(?:\.\d+)?)% \(melee \/ ranged\) Critical Rate per attack, up to a maximum of (\d+)%/i);
 if(crit)growth.critical={stat:'crit',perMelee:Number(crit[1]),perRanged:Number(crit[2]),maximum:Number(crit[3]),trigger:'attack',permanent:true};
 const mana=text.match(/grant (\d+) max Mana, up to (\d+)\. Triggers at most (\d+) times every (\d+) seconds/i);
 if(mana)growth.mana={stat:'mana',perTrigger:Number(mana[1]),maximum:Number(mana[2]),triggersPerWindow:Number(mana[3]),windowSeconds:Number(mana[4]),trigger:'attackOrMana',permanent:true};
 const speed=text.match(/Basic attacks grant (\d+)% Attack Speed, stacking up to (\d+) times/i);
 if(speed)growth.attackSpeed={stat:'attackSpeed',perTrigger:Number(speed[1]),maxStacks:Number(speed[2]),maximum:Number(speed[1])*Number(speed[2]),trigger:'attack',permanent:false};
 return {...(penetration.length?{penetration}:{}),...(Object.keys(growth).length?{growth}:{})};
}
module.exports={numericItemMechanics};

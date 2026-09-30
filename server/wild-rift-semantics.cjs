// Extract numeric facts, never copy guide prose into the public snapshot.
function damagePackets(text){
 const packets=[];
 for(const match of text.matchAll(/\b(physical|magic|true) damage\b/gi)){
  const before=text.slice(Math.max(0,match.index-240),match.index),boundary=Math.max(before.lastIndexOf('. '),before.lastIndexOf(';'),before.lastIndexOf('health upon'));
  const clause=before.slice(boundary+1),formula=clause.match(/(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*%?\s*(?:\([^)]*\))?(?:\s*(?:of|as|bonus|additional|the|target['’]s|max(?:imum)?|current|missing|Health|health)\s*)*)\s*$/i)?.[1];
  const scalings=[];
  // Only ratios in the formula immediately attached to this damage packet.
  for(const ratio of (formula||'').matchAll(/(\d+(?:\.\d+)?(?:%?\s*\/\s*\d+(?:\.\d+)?)*)(%)\s*(bonus\s+)?(AP|AD|Ability Power|Attack Damage|Armor|Magic Resist(?:ance)?|max(?:imum)? Health)\b/gi)){
   const stat=({ap:'ap',ad:'ad','ability power':'ap','attack damage':'ad',armor:'armor','magic resist':'magicResist','magic resistance':'magicResist','max health':'health','maximum health':'health'})[ratio[4].toLowerCase()];
   const coefficients=ratio[1].match(/\d+(?:\.\d+)?/g).map(Number).map(n=>n/100);
   if(stat&&coefficients.every(n=>n>=0&&n<=10))scalings.push({stat,coefficients,bonus:!!ratio[3]});
  }
  const bases=formula?.match(/^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*/)?.[0].match(/\d+(?:\.\d+)?/g).map(Number)||[];
  const percent=!!formula?.match(/^\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*%/);
  const tail=text.slice(match.index,match.index+100).split(/[.!;]/)[0],scope=clause+' '+tail;
  const healthBasis=/target.{0,15}(?:max|maximum)\s*health/i.test(scope)?'targetMaximum':/target.{0,15}missing\s*health/i.test(scope)?'targetMissing':/target.{0,15}current\s*health/i.test(scope)?'targetCurrent':null;
  // A bonus-stat ratio describes scaling, not an activation condition.
  const triggerClause=clause.replace(/\([^)]*\)/g,''),conditional=/\b(?:if|when|only|every|additional|bonus|critically|out of combat|against isolated|empowered|next (?:basic )?attack)\b/i.test(triggerClause);
  const repeats=scope.match(/\b(\d+) (?:times|hits|strikes|bolts)|(?:each|per) (?:second|hit|strike)/i);
  const crit=scope.match(/(?:critically strikes? for|critical strikes? (?:deal|dealing))\s*(\d+(?:\.\d+)?)%\s*(?:damage|AD|Attack Damage)/i);
  packets.push({type:match[1].toLowerCase(),...(bases.length&&bases.length<=5?{baseValues:bases,baseUnit:percent?'percent':'flat'}:{}),scalings,...(healthBasis?{healthBasis}:{}),attackTriggered:/\b(?:basic attacks?|attacks?) (?:deal|inflict)/i.test(clause),conditional,...(repeats?{repeated:true,...(repeats[1]?{maxHits:Number(repeats[1])}:{}),unit:/second/i.test(repeats[0])?'perSecond':'perHit'}:{}),...(crit?{criticalMultiplier:Number(crit[1])/100}:{}),parsed:!!formula});
 }
 return packets;
}
function passiveFacts(text){
 const trigger=/when struck|taking .*damage/i.test(text)?'incomingDamage':/basic attacks?|on.hit/i.test(text)?'attack':/after (?:using|casting)|cast.{0,20}ability|abilities? (?:deal|hit)/i.test(text)?'ability':/takedown/i.test(text)?'takedown':/out.of.combat/i.test(text)?'outOfCombat':'unspecified';
 const conditions=[];
 if(/same (?:enemy|target)|against (?:the )?same/i.test(text))conditions.push('sameTarget');
 if(/melee|ranged/i.test(text))conditions.push('range');
 if(/nearby|within \d+|radius/i.test(text))conditions.push('proximity');
 if(/out.of.combat/i.test(text))conditions.push('outOfCombat');
 if(/below \d+%|above \d+%/i.test(text))conditions.push('healthThreshold');
 const duration=Number(text.match(/\bfor (\d+(?:\.\d+)?) (?:seconds|s\b)/i)?.[1]);
 const maxStacks=Number(text.match(/(?:stack(?:s|ing)?[^.]{0,50}up to |maximum of |stacks? )(\d+)\b|\( stacks (\d+) times\)/i)?.slice(1).find(Boolean));
 const cooldown=Number(text.match(/\b(\d+(?:\.\d+)?)(?:s |[- ]second )cooldown\b|\bcooldown:?\s*(\d+(?:\.\d+)?)\s*s\b/i)?.slice(1).find(Boolean));
 const stacksPerTrigger=Number(text.match(/(?:grant|gain)(?:s)? (\d+) [\w -]*stack/i)?.[1]);
 return {trigger,conditions,...(duration>0&&duration<=120?{duration}:{}),...(maxStacks>1&&maxStacks<=100?{maxStacks}:{}),...(cooldown>0&&cooldown<=300?{cooldown}:{}),...(stacksPerTrigger>0&&stacksPerTrigger<=10?{stacksPerTrigger}:{}),uptime:'conditional'};
}
module.exports={damagePackets,passiveFacts};

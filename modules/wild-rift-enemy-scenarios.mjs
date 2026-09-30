import {championBuilds,guideQuality} from './wild-rift-quality.mjs?v=20261001-auto1';
import {finalBuildAvailable} from './wild-rift-evidence.mjs?v=20261001-auto1';
import {championProfile} from './wild-rift-build-fit.mjs?v=20261001-auto1';
const cache=new WeakMap();
export function enemyBuildScenarios(data,champion,role,observed=[],selected=''){
 let byChampion=cache.get(data);if(!byChampion){byChampion=new Map();cache.set(data,byChampion);}
 const key=champion.id+':'+role+':'+Math.floor(Date.now()/60000);
 let guides=byChampion.get(key);
 if(!guides){
  const unique=new Set();guides=championBuilds(champion).filter(b=>b.role===role&&guideQuality(data,champion,role,Date.now(),b.guideId).usable&&finalBuildAvailable(data,b.final)).filter(b=>{const key=[...b.final].sort().join(':');if(unique.has(key))return false;unique.add(key);return true;}).map(b=>({guide:b,profile:championProfile(data,champion,b)}));
  if(byChampion.size>500)byChampion.clear();byChampion.set(key,guides);
 }
 const ranked=guides.map(g=>({...g,overlap:observed.filter(id=>g.guide.final.includes(id)).length})).sort((a,b)=>b.overlap-a.overlap);
 const choice=ranked.find(g=>g.guide.guideId===selected);
 const candidates=choice?[choice]:ranked.filter(g=>!observed.length||g.overlap===ranked[0]?.overlap);
 // Keep distinct damage/play styles, not three copies of one popular set.
 const styles=new Set(),scenarios=candidates.filter(g=>{const key=g.profile.damage+':'+g.profile.style+':'+g.profile.ability.form;if(styles.has(key))return false;styles.add(key);return true;}).slice(0,3);
 const possibleDamage=[...new Set(scenarios.map(g=>g.profile.threatDamage))];
 return {scenarios,options:ranked.slice(0,16),selected:choice?.guide.guideId||'',possibleDamage,ambiguous:possibleDamage.length>1||scenarios.some(g=>g.profile.ability.forms.length>1&&!g.profile.ability.form),basis:choice?'Senin seçtiğin kaynak oynanışını esas alır; alınmış eşya anlamına gelmez.':observed.length?'Gördüğün eşyalara en çok uyan güncel kaynak düzenleri karşılaştırıldı.':'Güncel rol rehberlerinin farklı hasar ve oynanış düzenleri karşılaştırıldı; eşya satın alındığı varsayılmadı.'};
}

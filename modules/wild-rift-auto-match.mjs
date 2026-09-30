import {purchasePlan,affordableComponents,itemCost} from './wild-rift-purchase.mjs?v=20261001-auto1';
import {combatFacts,incompatibleItem} from './wild-rift-build-fit.mjs?v=20261001-auto1';
import {itemFacts,BOOTS} from './wild-rift-item-rules.mjs?v=20261001-auto1';
import {itemAvailability,finalItemAvailable} from './wild-rift-evidence.mjs?v=20261001-auto1';

// These are prepared routes, not assertions about the player's wallet or state.
export function shoppingRoutes(data,draft,result){
 if(result.missing)return [];
 const reference={...draft,gold:0,owned:[],locked:[],purchaseTarget:'',matchMinutes:null,upgradedBoot:'',phase:'lane',ownState:'even'};
 const normal=purchasePlan(data,reference,result),behind=purchasePlan(data,{...reference,ownState:'behind'},result);
 const first=normal.rows[0]?.id,parts=first?[600,1000,1500].map(budget=>({budget,part:affordableComponents(data,first,budget).find(p=>p.id!==first)})).filter(r=>r.part):[];
 const unique=parts.filter((r,i)=>!parts.slice(0,i).some(p=>p.part.id===r.part.id));
 const routes=[{id:'normal',title:'Normal başlangıç',condition:'Koridorda güvenli gelir alabiliyorsan.',starting:normal.starters,order:normal.rows.map(r=>r.finalId||r.id),parts:unique,first,cost:first?itemCost(data,first):null,delay:0}];
 const lanes=result.context.rows.filter(r=>r.lane),defense=behind.early?.find(e=>e.kind!=='heal'),boot=behind.rows.find(r=>BOOTS.includes(r.id)&&((itemFacts(data,r.id).stats.armor||0)>=15||(itemFacts(data,r.id).stats.magicResist||0)>=15));
 const counter=normal.early?.find(e=>e.kind==='heal');
 const defensiveFirst=defense?.id||boot?.id||first;
 routes.push({id:'pressure',title:'Baskı altındaysan',condition:lanes.length?'Can kaybı yüzünden dalgaya yaklaşamıyorsan.':'Güvenli gelir alamıyorsan; koridor henüz bilinmiyor.',order:[...new Set([defensiveFirst,...behind.rows.map(r=>r.finalId||r.id)].filter(Boolean))],first:defensiveFirst,cost:defense?.cost??boot?.cost??normal.rows[0]?.cost,delay:defense?.cost||0,target:defense?.target||boot?.finalId||first,reason:defense?.reason||(boot?'Seçilen savunma botunu erken değerlendir; ilk ana eşyanın tamamlanması gecikir.':'Seçilen sette doğrulanmış erken savunma sapması yok; ana eşyanı koru ve güvenli gelir al.')});
 if(counter)routes.push({id:'counter',title:'Erken karşı parça',condition:counter.targets.join(', ')+' iyileşmesi takası bozuyorsa.',first:counter.id,cost:counter.cost,delay:counter.cost,target:counter.target,order:normal.rows.map(r=>r.finalId||r.id),reason:'Parça son setine birleşir. İyileşme azaltmayı gerçekten uygulayabildiğin eşleşmelerde değerli.'});
 else routes.push({id:'counter',title:'Erken karşı parça',condition:'Bu eşleşmede kaynak ve tarifle doğrulanan gerekli erken parça yok.',first:null,delay:0,order:normal.rows.map(r=>r.finalId||r.id),reason:'Gereksiz sapma eklenmedi; ana eşya rotasını izle.'});
 return routes;
}

export function quickMatchPlan(data,draft,result){
 if(result.missing)return null;
 const own=result.champion,ownFacts=combatFacts(data,own),rows=result.context.rows;
 const enemy=rows.filter(r=>r.lane).sort((a,b)=>Number(b.native?.mechanics.control)-Number(a.native?.mechanics.control)||b.weight-a.weight)[0]||rows.find(r=>r.role==='jungle')||rows[0];
 const abilities=enemy?.native?.abilityFacts||[],danger=abilities.filter(a=>a.slot!=='P').sort((a,b)=>Number(!!b.flags.control)-Number(!!a.flags.control)||Number(b.damageTypes.includes('true'))-Number(a.damageTypes.includes('true')))[0];
 const slot=a=>a.slot==='4'?'ultisi':a.slot+'. yeteneği';
 const ownWindow=ownFacts?.abilityFacts.find(a=>a.slot!=='P'&&(a.flags.control||a.flags.mobility));
 const target=rows.slice().sort((a,b)=>(b.fed?10:0)+(['duo','mid'].includes(b.role)?3:0)+(b.keys.heal||0)+(b.keys.shield||0)-(b.keys.tank||0)*2-((a.fed?10:0)+(['duo','mid'].includes(a.role)?3:0)+(a.keys.heal||0)+(a.keys.shield||0)-(a.keys.tank||0)*2))[0];
 const tips=[
  danger?{title:'Kaçın',text:enemy.name+' '+slot(danger)+' '+(danger.flags.control?'kontrol etkisi taşıyor. Hazır olduğunu gördüğünde kaçışını sakla.':danger.damageTypes.includes('true')?'gerçek hasar verebilir. Dirence güvenmek yerine yetenekten kaçın.':'hasar kanalını kullanıyor. Boşa çıktığını görmeden uzun takası zorlama.'),source:enemy?.native?.source}:null,
  danger?{title:'Takas fırsatı',text:enemy.name+' '+slot(danger)+' boşa çıktıktan sonra '+(ownWindow?own.name+' '+slot(ownWindow)+' ile kısa takası değerlendir.':'kısa takas ara; kaçışın hazır değilse takip etme.')+(danger.baseCooldown?.length?' Kaynak temel süresi '+Math.min(...danger.baseCooldown)+'–'+Math.max(...danger.baseCooldown)+' sn; canlı sayaç değildir.':''),source:enemy?.native?.source}:null,
  {title:'Takım savaşı',text:target?(result.profile.support||result.profile.tank?'Taşıyıcını '+target.name+' tehdidine karşı koru; takımın takip edemiyorsa giriş yapma.':target.name+' güvenli erişim varsa öncelikli baskı adayı. Ona ulaşmak için görüşsüz alana girme; erişemiyorsan en yakın güvenli hedefe vur.'):'Rakip seçimleri tamamlanınca öncelikli tehdit belirlenecek.',source:result.base.source}
 ];
 for(let i=0;i<2;i++)if(!tips[i])tips[i]={title:i===0?'Kaçın':'Takas fırsatı',text:i===0?'Doğrulanmış rakip yeteneği henüz yok. Görüşsüz bölgede kaçış yeteneğini tüketme.':'Rakibin ana yeteneğinin boşa çıktığını gördüğünde kısa takas ara; güvenli geliri bırakma.',source:null};
 return {enemy,target,tips,routes:shoppingRoutes(data,draft,result)};
}

// A click means the user actually saw this item. No candidate is preselected.
export function criticalItemOptions(data,result,row){
 const sourceIds=new Set(row.buildScenarios.options.flatMap(s=>s.guide.final)),profile=row.buildScenarios.scenarios[0]?.profile;
 return Object.keys(data.items).filter(id=>finalItemAvailable(data,id)&&!BOOTS.includes(id)&&(!profile||!incompatibleItem(data,id,profile))).map(id=>({id,f:itemFacts(data,id)})).filter(({f})=>(result.profile.damage==='magic'&&(f.stats.magicResist||0)>=25)||(result.profile.damage==='physical'&&(f.stats.armor||0)>=30)||(profile?.attack&&(f.stats.crit||0)>=20)||(result.profile.native.heal&&f.effects.antiHeal)||(result.profile.native.shield&&f.effects.antiShield)).sort((a,b)=>Number(sourceIds.has(b.id))-Number(sourceIds.has(a.id))||a.id.localeCompare(b.id)).slice(0,4).map(x=>x.id);
}

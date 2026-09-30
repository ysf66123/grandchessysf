import {itemFacts} from './wild-rift-item-rules.mjs?v=20261001-interactions1';
export function defenseApplication(data,id,context,profile){
 const d=itemFacts(data,id).mechanics.defense;if(!d)return {factor:1,known:false};
 const abilities=context.rows.flatMap(r=>(r.native?.abilityFacts||[]).map(a=>({row:r,ability:a})));
 if(d.kind==='cleanse'){
  const control=abilities.filter(x=>x.ability.flags.control),supported=control.filter(x=>(x.ability.controlTypes||[]).length&&(x.ability.controlTypes||[]).every(type=>!(d.excluded||[]).includes(type)));
  const targets=[...new Set(supported.map(x=>x.row.name))];
  const weight=xs=>xs.reduce((n,x)=>n+(x.row.weight||1),0),factor=(control.length?Math.max(.25,weight(supported)/weight(control)):.35)*(d.recipient==='ally'&&!profile.support?.35:1);
  return {known:true,factor,kind:d.kind,activation:d.activation,recipient:d.recipient,targets,reason:targets.length?(d.recipient==='ally'?'Takım arkadaşındaki':'Kendindeki')+' doğrulanmış kontrol etkisini kaldırmak için sakla.'+(supported.length<control.length?' Rakibin diğer kontrol etkileri için tam çözüm değildir.':''):control.length?'Bilinen kontrol türlerine karşı kaldırma kapsamı doğrulanmadı; tam çözüm sayılmıyor.':'Rakip seçimlerinde kaldırılabilir kontrol henüz doğrulanmadı.'};
 }
 if(d.kind==='revive')return {known:true,factor:.8,kind:d.kind,activation:d.activation,recipient:d.recipient,targets:[],reason:'Ölümcül hasarda kendiliğinden çalışır. Aktif staz gibi basılmaz; dirileceğin konumda takımının koruması gerekir.'};
 if(d.kind==='stasis')return {known:true,factor:1,kind:d.kind,activation:d.activation,recipient:d.recipient,targets:context.rows.filter(r=>r.keys.burst||r.keys.physical).map(r=>r.name),reason:'Elle kullanılan stazdır. Kritik hasar gelmeden zamanla; staz sırasında saldırı, hareket ve başka eşya kullanımı yapılamaz.'};
 return {known:true,factor:.8,kind:d.kind,activation:d.activation,recipient:d.recipient,targets:context.rows.filter(r=>r.keys.cc).map(r=>r.name),reason:'Sonraki yeteneğe karşı pasif korumadır; küçük bir yetenekle harcanabileceği için tüm kontrol etkilerini çözdüğü varsayılmaz.'};
}
export function defensePlan(data,result){return result.final.map(id=>({id,...defenseApplication(data,id,result.context,result.profile)})).filter(r=>r.known);}

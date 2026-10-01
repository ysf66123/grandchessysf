import {NEED_LABELS} from './wild-rift-item-rules.mjs?v=20261001-combat2';
import {itemName} from './wild-rift-tr.mjs?v=20261001-combat2';
export function decisionConditions(result,draft){
 const lines=[],rows=result.context.rows;
 for(const row of rows.filter(r=>r.buildScenarios?.ambiguous))lines.push({kind:'enemyStyle',text:row.name+' için farklı hasar düzenleri var. Biçimini veya kaynak setini kesinleştirirsen savunma tercihleri yeniden değerlendirilir.'});
 const resistance=result.profile.damage==='magic'?'magicResist':'armor',threshold=resistance==='magicResist'?30:40;
 const targets=rows.filter(r=>r.target||r.lane);
 for(const row of targets)if(row.stats[resistance]<threshold&&result.alternatives.some(a=>a.key===resistance&&!a.selected))lines.push({kind:'resistance',text:row.name+' üzerinde '+NEED_LABELS[resistance].toLocaleLowerCase('tr-TR')+' belirginleşirse delme alternatifleri güçlenebilir. Kaynak koşulunun alt sınırı '+threshold+' eşya direncidir; satın almayı gördüğünde ekle.'});
 if(rows.length&&!draft.fed)lines.push({kind:'fed',text:'Öne geçen rakibi seçersen o rakibin baskısı daha fazla ağırlık taşır; mevcut dengeli setin savunma tercihi değişebilir.'});
 for(const a of result.alternatives.filter(a=>a.blocking==='Satın alınmış eşya korunuyor.').slice(0,1))lines.push({kind:'inventory',text:itemName(a.from)+' satın alındığı için korunuyor. Envanter bilgisini düzeltmeden '+itemName(a.to)+' ile değiştirilemez; satış önerilmez.'});
 if(draft.phase!=='lane')lines.push({kind:'phase',text:'Koridor aşamasını ve geride olduğunu belirtirsen, görülen koridor baskısına uygun tarif parçası veya savunma botu alışverişte öne çıkabilir.'});
 if(result.bootUpgrade?.verified)lines.push({kind:'time',text:'10. dakikaya ulaşıp ana botu aldığında '+result.bootUpgrade.name+' aynı yuvada yükseltilebilir. Altınını ve maç dakikasını gir; ana eşyayı geciktirme bedeli ayrıca gösterilir.'});
 return lines.slice(0,5);
}

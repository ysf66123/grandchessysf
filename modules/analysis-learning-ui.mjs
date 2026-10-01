import {personalLessons,errorChains,openingInsights,clockInsights,learningRecord,historySummary,trainingResult} from './analysis-learning.mjs?v=20261001-speed3a';
import {readLearning as read,writeLearning as write,clearLearning,ensureLearningSync,learningStatus} from './chess-learning-store.mjs?v=20261001-speed3a';
import {openingNameTR} from './chess-opening-names.mjs?v=20261001-speed3a';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
function key(){return 'gm_review_learning_v1_'+(window.currentUser?.uid||'guest');}
let activeTraining=null;
export function finishLearningAttempt(success){
 if(success==null||!activeTraining)return;
 const records=read(),record=records.find(r=>r.id===activeTraining.id),item=record?.training.find(t=>t.index===activeTraining.index);
 if(item){Object.assign(item,trainingResult(item,success));write(records);}activeTraining=null;
}
export function clearLearningAttempt(){activeTraining=null;}
export function renderLearningUI({id,pgn,players,reviews,insights,providedClocks=[],openTraining}){
 ensureLearningSync();
 const root=document.getElementById('reviewLearning');if(!root||!reviews.length||reviews.some(r=>!r.complete||r.stable===false))return;
 const uid=window.currentUser?.uid,own=uid?players.find(p=>p.uid===uid||p.id===uid):null;
 const savedSide=read().find(r=>r.id===id+':w'||r.id===id+':b')?.side;
 const side=own?.team==='black'?'b':own?.team==='white'?'w':document.getElementById('reviewLearningSide')?.value||savedSide||'w';
 const records=read().filter(r=>r.id===id+':'+side || (r.id!==id+':w'&&r.id!==id+':b')),
  record=learningRecord(id+':'+side,pgn,players,reviews,side,side==='w'?insights.white.phases:insights.black.phases);
 const existing=records.find(r=>r.id===record.id);if(existing){record.at=existing.at;for(const t of record.training){const old=existing.training.find(x=>x.index===t.index);if(old)Object.assign(t,{streak:old.streak,attempts:old.attempts,lastAttempt:old.lastAttempt,due:old.due});}records[records.indexOf(existing)]=record;}else records.push(record);
 // One record per game/side, with a bounded device-local history.
 const stored=write(records),history=historySummary(records.filter(r=>r.accuracy!=null));
 const opened=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.learningSection));root.replaceChildren();
 const section=(title,name,open=false)=>{const d=el('details',null,'studio-learning-section');d.dataset.learningSection=name;d.open=opened.has(name)||(!opened.size&&open);d.append(el('summary',title));root.append(d);return d;};
 const action=(text,fn)=>{const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
 const jump=i=>{window.jumpToMove(i+1);window.setAnalysisMobileTab('focus');};
 const lessons=section('Bu maçtan üç ders','lessons',true),selector=el('select');selector.id='reviewLearningSide';selector.setAttribute('aria-label','İncelenecek taraf');
 for(const [value,label] of [['w','Beyaz'],['b','Siyah']]){const o=el('option',label);o.value=value;selector.append(o);}selector.value=side;
 if(!own){selector.onchange=()=>renderLearningUI({id,pgn,players,reviews,insights,providedClocks,openTraining});lessons.append(selector);}
 for(const lesson of personalLessons(reviews,side)){const b=action('',()=>jump(lesson.index));b.classList.add('studio-lesson');b.append(el('strong',lesson.title),el('span',lesson.text));lessons.append(b);}
 const chains=section('Hata zincirleri','chains');
 const groups=errorChains(reviews);if(!groups.length)chains.append(el('p','Birbirine yakın ardışık kritik karar bulunmadı.'));
 for(const group of groups.slice(0,5)){const card=el('div',null,'studio-learning-card');card.append(el('strong',(group.color==='w'?'Beyaz':'Siyah')+' · '+group.indices.length+' ardışık kritik karar'),el('p','Bu bölümde konum toparlanmadan art arda değerlendirme kayıpları oluştu.'));
  for(const i of group.indices)card.append(action(reviews[i].moveNumber+'. '+reviews[i].moveSan,()=>jump(i)));chains.append(card);}
 const opening=openingInsights(reviews),openingPanel=section('Açılış ve zaman kullanımı','opening');
 openingPanel.append(el('p',opening.name?opening.eco+' · '+openingNameTR(opening.name):'Açılış veritabanında eşleşme yok.'));
 if(opening.departure!=null)openingPanel.append(action('Bilinen konumların dışına çıkış',()=>jump(opening.departure)),el('p','Veritabanının dışına çıkmak tek başına hata değildir.'));
 if(opening.firstError!=null)openingPanel.append(action('İlk gerçek değerlendirme kaybı',()=>jump(opening.firstError)));
 const clock=clockInsights(pgn,reviews,providedClocks);
 openingPanel.append(el('p',clock.samples?`${clock.samples} hamlede süre verisi · ${clock.pressureMoves} hamlede saat 30 saniye veya altında · bunların ${clock.pressureErrors} tanesinde kritik kayıp.`:'Bu maçta hamle süreleri bulunmuyor; zaman baskısı yorumu üretilmedi.'));
 if(clock.averageElapsed!=null)openingPanel.append(el('p','Ölçülen hamlelerde ortalama düşünme süresi '+clock.averageElapsed.toFixed(1)+' saniye.'));
 const practice=section('Kendi maçlarından antrenman','training'),due=records.flatMap(r=>r.training.filter(t=>Number.isFinite(t.due)&&t.due<=Date.now()).map(t=>({record:r,item:t}))).sort((a,b)=>b.item.loss-a.item.loss);
 practice.append(el('p',`${due.length} tekrar zamanı gelmiş konum · başarıdan sonra aralıklı tekrar. ${stored?'Bu cihazda saklanır.':'Tarayıcı depolaması dolu; yeni kayıt saklanamadı.'}`));
 for(const {record:r,item:t} of due.slice(0,6)){const b=action((r.side==='w'?'Beyaz':'Siyah')+' · '+(t.index+1)+'. yarım hamle · '+(t.attempts||0)+' deneme',async()=>{activeTraining=null;if(await openTraining(r,t))activeTraining={id:r.id,index:t.index};});practice.append(b);}
 if(!due.length)practice.append(el('p','Bekleyen tekrar yok. Yeni analizlerdeki kritik konumlar otomatik eklenecek.'));
 const progress=section('Kişisel gelişim','history');progress.append(el('p',`Bu cihazda ${history.games} son maç · ortalama doğruluk ${history.accuracy==null?'—':'%'+history.accuracy}`));
 if(history.previousAccuracy!=null)progress.append(el('p','Önceki 20 maçın ortalaması %'+history.previousAccuracy+' · fark '+(history.accuracy-history.previousAccuracy).toFixed(1)+' puan.'));
 for(const theme of history.themes.slice(0,4))progress.append(el('div',theme.name+' · '+theme.count+' kritik konum','studio-learning-row'));
 const names={opening:'Açılış',middle:'Oyun ortası',end:'Oyun sonu'};
 for(const phase of history.phases)progress.append(el('div',names[phase.phase]+' · '+(phase.accuracy==null?'veri yok':'%'+phase.accuracy+' · '+phase.games+' maç'),'studio-learning-row'));
 for(const o of history.openings)progress.append(el('div',openingNameTR(o.name)+' · '+o.games+' maç · '+o.errors+' açılışta kritik karar','studio-learning-row'));
 progress.append(el('p','İçe aktarılan maçlarda taraf seçimini kontrol et. Farklı rakip ve sürelerdeki doğruluklar doğrudan güç ölçüsü değildir.'));
 progress.append(el('p',learningStatus()));
 progress.append(action('Açılış repertuvarı ve gelişim merkezi',()=>window.openChessAcademy?.('repertoire')));
 const remove=action('Öğrenme geçmişini sil',()=>{clearLearning();root.replaceChildren(el('p','Öğrenme geçmişi silindi. Sonraki tamamlanan analizler yeniden kaydedilir.'));});progress.append(remove);
}

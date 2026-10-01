import {readLearning,ensureLearningSync,learningStatus,syncLearning} from './chess-learning-store.mjs?v=20261001-speed2';
import {buildRepertoire,progressGroups,TIME_NAMES,ENDGAME_LESSONS} from './chess-academy-core.mjs?v=20261001-speed2';
import {tablebase} from './analysis-data.mjs?v=20261001-speed2';
import {openingNameTR} from './chess-opening-names.mjs?v=20261001-speed2';
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;},
 button=(text,fn)=>{const b=el('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
const view=el('div',null,'view');view.id='view-chess-academy';document.querySelector('.app-container').append(view);
let tab='repertoire',time='all',exercise=null,selected=null,busy=false,token=0,message='',last=null,oracle=null;
window.openChessAcademy=async function(next='repertoire'){
 token++;window.cancelChessAcademyEngine?.();exercise=null;selected=null;busy=false;oracle=null;
 window.cancelAnalysisReview?.();tab=['repertoire','endgames','progress'].includes(next)?next:'repertoire';
 window.switchView('view-chess-academy');render();await ensureLearningSync();if(document.body.dataset.activeView==='view-chess-academy')render();
};
function render(){view.replaceChildren();const head=el('header',null,'academy-header');head.append(el('div',null));head.firstChild.append(el('span','GRANDMASTER / GELİŞİM MERKEZİ','academy-kicker'),el('h2','Her maçından daha güçlü çık.'),el('p','Kendi açılışların, oyun sonu çalışmaları ve ölçülen gelişimin.'));
 head.append(button('Ana sayfa',()=>window.switchView('view-dashboard')));view.append(head);
 const nav=el('nav',null,'academy-tabs');nav.setAttribute('aria-label','Gelişim bölümleri');
 for(const [id,label]of [['repertoire','Açılış repertuvarı'],['endgames','Oyun sonu akademisi'],['progress','Kişisel gelişim']]){const b=button(label,()=>{token++;window.cancelChessAcademyEngine?.();exercise=null;busy=false;tab=id;render();});b.setAttribute('aria-current',tab===id?'page':'false');nav.append(b);}view.append(nav);
 if(exercise){renderExercise();return;}
 if(tab==='repertoire')renderRepertoire();else if(tab==='endgames')renderEndgames();else renderProgress();
 const foot=el('p',learningStatus(),'academy-sync');foot.id='academySyncStatus';view.append(foot,button('Hesapla şimdi eşitle',async()=>{await syncLearning();render();}));
}
function renderRepertoire(){const records=readLearning(),groups=buildRepertoire(Chess,records),grid=el('div',null,'academy-grid');
 view.append(el('p',`${records.length} kayıtlı analizden en sık karşılaştığın konumlar. Maç sayısı sıklığı gösterir; kazanma oranı değildir.`));
 if(!groups.length)view.append(el('p','Bir maçını analiz et. Açılış konumların ve oynadığın devamlar burada otomatik oluşacak.','academy-empty'));
 for(const g of groups.slice(0,24)){const card=el('article',null,'academy-card');card.append(el('small',g.side==='w'?'BEYAZ REPERTUVARI':'SİYAH REPERTUVARI'),el('h3',openingNameTR(g.opening)),el('p',g.samples+' maçta bu konuma ulaştın.'));
  for(const c of g.choices.slice(0,3))card.append(el('p',`${c.san} · ${c.games} maç${c.accuracy==null?' · motor ölçümü yok':` · ${c.scores.length} ölçümde %${c.accuracy} · ${c.errors} kritik kayıp`}`));
  card.append(button('Tahtada tekrar et',()=>{const c=g.choices[0];exercise={kind:'opening',game:new Chess(g.fen),side:g.side,target:c.best||c.uci,title:openingNameTR(g.opening),fen:g.fen};
   selected=null;last=null;busy=false;message=c.best?'Tamamlanan analizindeki motor adayını bul.':'En sık oynadığın devamı hatırla. Bu konum için motor doğrulaması saklanmamış.';render();}));grid.append(card);
 }view.append(grid);
}
function renderEndgames(){view.append(el('p','Şahını ve taşlarını oynatarak konumu sonuca kadar tamamla. Syzygy erişilemezse Stockfish devamıyla çalışılır; kanıt kaynağı görünür.'));
 const grid=el('div',null,'academy-grid');for(const lesson of ENDGAME_LESSONS){const card=el('article',null,'academy-card');card.append(el('small',lesson.goal==='win'?'KAZANMA ÇALIŞMASI':'BERABERLİK ÇALIŞMASI'),el('h3',lesson.title),el('p',lesson.text),button('Çalışmaya başla',()=>startEndgame(lesson)));grid.append(card);}view.append(grid);}
function renderProgress(){const selector=el('select');selector.setAttribute('aria-label','Gelişim için maç süresi');for(const [id,name]of Object.entries(TIME_NAMES)){const option=el('option',name);option.value=id;selector.append(option);}selector.value=time;selector.onchange=()=>{time=selector.value;render();};view.append(selector);
 const g=progressGroups(readLearning(),time);view.append(el('p',`${g.samples} kayıtlı maç · son ${g.recent.length} maçın doğruluğu ${g.mean==null?'—':'%'+g.mean}${g.previousMean==null?'':` · önceki grubun ortalaması %${g.previousMean}`}`));
 if(!g.recent.length){view.append(el('p','Bu süre türünde henüz analiz kaydı yok. Süresi bilinmeyen maçlar ayrı tutulur.','academy-empty'));return;}
 const chart=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.setAttribute('viewBox','0 0 680 260');chart.setAttribute('role','img');chart.setAttribute('aria-label','Son maçlarda genel ve oyun evrelerine göre doğruluk');chart.classList.add('academy-chart');
 const svg=(tag,attrs)=>{const n=document.createElementNS(chart.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 for(const n of [0,25,50,75,100]){chart.append(svg('line',{x1:38,y1:225-n*2,x2:650,y2:225-n*2,stroke:'#ffffff20'}));const t=svg('text',{x:4,y:230-n*2,fill:'#bfcac2','font-size':12});t.textContent=n;chart.append(t);}
 const legend=el('div',null,'academy-chart-legend');
 for(const [phase,name,color]of [['all','Genel','#b8da84'],['opening','Açılış','#63b8ed'],['middle','Oyun ortası','#ebbf67'],['end','Oyun sonu','#c493ef']]){
  let segment=[];const flush=()=>{if(segment.length)chart.append(svg('polyline',{points:segment.join(' '),fill:'none',stroke:color,'stroke-width':2}));segment=[];};
  g.recent.forEach((r,i)=>{const score=phase==='all'?r.accuracy:r.phases?.find(p=>p.phase===phase)?.accuracy;if(!Number.isFinite(score)){flush();return;}
   const x=38+i*612/Math.max(1,g.recent.length-1),y=225-score*2;segment.push(x+','+y);const point=svg('circle',{cx:x,cy:y,r:3,fill:color});const title=svg('title',{});title.textContent=`${name} · %${score} · ${new Date(r.at).toLocaleDateString('tr-TR')}`;point.append(title);chart.append(point);
  });flush();const label=el('span',name);label.style.color=color;legend.append(label);
 }view.append(chart,legend,el('p','Grafikler gerçek analiz kayıtlarını gösterir. Az sayıda maç güç veya Elo tahmini için yeterli değildir. Evre verisi olmayan konumlarda çizgi kesilir.'));
}
async function startEndgame(lesson){token++;exercise={...lesson,kind:'endgame',finished:false,unverified:false,promotion:'q',game:new Chess(lesson.fen)};selected=null;last=null;oracle=null;busy=true;message='Konum ve oyun sonu verisi hazırlanıyor…';render();const t=token;
 const initial=await tablebase(new Chess(exercise.game.fen()));if(t!==token)return;oracle=initial;
 if(oracle){const expected=lesson.goal==='win'?'win':'draw';if(oracle.category!==expected){message='Kaynak bu çalışma hedefini doğrulamadı. Konumu serbest inceleyebilirsin.';exercise.unverified=true;}else message=lesson.text+' · Syzygy ile konum hedefi doğrulandı.';}
 else message=lesson.text+' · Syzygy erişilemedi; Stockfish kullanılacak.';busy=false;render();}
function renderExercise(){const wrap=el('div',null,'academy-exercise'),board=el('div',null,'academy-board');board.setAttribute('aria-label',exercise.title+' çalışma tahtası');const game=exercise.game,array=game.board(),rotate=exercise.side==='b';
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){const row=rotate?7-r:r,col=rotate?7-c:c,square=String.fromCharCode(97+col)+(8-row),piece=array[row][col],b=button('',()=>playSquare(square));b.className='academy-square '+((r+c)%2?'black':'white');b.dataset.sq=square;
  b.setAttribute('aria-label',square+(piece?' '+(piece.color==='w'?'Beyaz':'Siyah')+' '+({p:'piyon',n:'at',b:'fil',r:'kale',q:'vezir',k:'şah'}[piece.type]):' boş'));b.disabled=busy;
  b.classList.toggle('selected',selected===square);b.classList.toggle('last-move-from',last?.from===square);b.classList.toggle('last-move-to',last?.to===square);
  if(selected&&game.moves({square:selected,verbose:true}).some(m=>m.to===square))b.classList.add('academy-target');
  if(piece){const image=el('span',null,'academy-piece'),fallback=el('span',({w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}[piece.color][piece.type]),'academy-unicode-piece');fallback.style.color=piece.color==='w'?'#fff':'#252b29';const img=el('img');img.alt='';img.style.opacity='0';img.onload=()=>{img.style.opacity='1';fallback.hidden=true;};img.onerror=()=>img.remove();img.src=window.getPieceAsset?.(piece.color,piece.type)||`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${piece.color}${piece.type}.png`;image.append(fallback,img);b.append(image);}
  if(c===0)b.append(el('small',String(8-row),'academy-rank'));if(r===7)b.append(el('small',String.fromCharCode(97+col),'academy-file'));board.append(b);
 }
 const info=el('aside',null,'academy-card');info.append(el('h3',exercise.title),el('p',message,'academy-exercise-status'));const promotion=el('select');promotion.id='academyPromotion';promotion.setAttribute('aria-label','Terfi taşı');for(const [v,n]of [['q','Vezir'],['r','Kale'],['b','Fil'],['n','At']]){const o=el('option',n);o.value=v;promotion.append(o);}promotion.value=exercise.promotion||'q';promotion.onchange=()=>exercise.promotion=promotion.value;
 info.append(el('label','Terfi seçimi'),promotion,button('Konumu yeniden başlat',()=>exercise.kind==='endgame'?startEndgame(exercise):(exercise.game=new Chess(exercise.fen),exercise.finished=false,selected=null,last=null,message='Hedef devamı bul.',render())),button('Çalışma listesine dön',()=>{token++;window.cancelChessAcademyEngine?.();exercise=null;busy=false;render();}));wrap.append(board,info);view.append(wrap);}
async function playSquare(square){if(!exercise||busy||exercise.finished||exercise.game.turn()!==exercise.side)return;const g=exercise.game,piece=g.get(square);
 if(piece?.color===exercise.side){selected=square;render();return;}if(!selected)return;
 const move=g.move({from:selected,to:square,promotion:exercise.promotion||'q'});if(!move){selected=null;render();return;}selected=null;last=move;
 if(exercise.kind==='opening'){const uci=move.from+move.to+(move.promotion||'');if(uci===exercise.target){message='Hedef devamı buldun. Konumu tekrar edebilir veya listeye dönebilirsin.';exercise.finished=true;}else{g.undo();last=null;message='Bu çalışmanın hedefi farklı bir devam. Yeniden dene; bu yanıt tek başına hamlenin kötü olduğunu göstermez.';}render();return;}
 if(checkFinish())return;busy=true;message='Hamlen ve rakibin yanıtı inceleniyor…';render();const t=token,after=await tablebase(new Chess(g.fen()));if(t!==token)return;
 if(after&&oracle&&!exercise.unverified){const good=exercise.goal==='win'?after.category==='loss':['draw','loss'].includes(after.category);
  if(!good){g.undo();last=null;busy=false;message='Syzygy’ye göre hedef sonuç korunmadı. Başka bir hamle dene.';render();return;}}
 let uci=after?.moves?.[0]?.uci;
 if(!uci){try{await window.initStockfish();const result=await window.queueStockfishEval(g.fen(),{mode:'academy',depth:22,multiPv:1,requestId:t,timeoutMs:30000});if(t!==token)return;if(result.complete)uci=result.bestMove;}catch{}}
 if(t!==token)return;if(!uci){busy=false;message='Rakip yanıtı alınamadı. Aynı konumu yeniden başlatabilirsin.';render();return;}
 const reply=g.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||'q'});if(!reply){busy=false;message='Kaynak yanıtı geçersiz; çalışma durduruldu.';render();return;}
 last=reply;const nextOracle=await tablebase(new Chess(g.fen()));if(t!==token)return;oracle=nextOracle;busy=false;if(!checkFinish()){message=exercise.text+' · '+(oracle?'Syzygy oyun sonu verisi':'Stockfish devamı');render();}
}
function checkFinish(){const g=exercise.game;if(!g.game_over())return false;busy=false;exercise.finished=true;
 const success=g.in_checkmate()?g.turn()!==exercise.side:exercise.goal==='draw';message=success?'Çalışmayı tamamladın. Hedef sonuca ulaştın.':g.in_stalemate()?'Pat oluştu. Kazanma hedefi için konumu yeniden başlat.':'Hedef sonuç elde edilemedi; konumu yeniden dene.';render();return true;}
const dashboard=document.getElementById('view-dashboard'),entry=el('div',null,'academy-entry');entry.append(el('strong','Satranç gelişim merkezi'),el('span','Kendi açılışlarını tekrar et, oyun sonlarını tamamla, gelişimini izle.'),button('Gelişim merkezini aç',()=>window.openChessAcademy()));dashboard.append(entry);
new MutationObserver(()=>{if(document.body.dataset.activeView!=='view-chess-academy'&&exercise){token++;window.cancelChessAcademyEngine?.();busy=false;exercise=null;}}).observe(document.body,{attributes:true,attributeFilter:['data-active-view']});
window.addEventListener('gm-learning-updated',()=>{const status=document.getElementById('academySyncStatus');if(status)status.textContent=learningStatus();});

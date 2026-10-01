export function timeGroup(tc){const m=String(tc||'').match(/^(\d+)(?:\+(\d+))?$/);if(!m)return 'unknown';const seconds=Number(m[1])+40*Number(m[2]||0);return seconds<180?'bullet':seconds<600?'blitz':seconds<1800?'rapid':'classical';}
export const TIME_NAMES={all:'Bütün süreler',bullet:'Çok hızlı',blitz:'Yıldırım',rapid:'Hızlı',classical:'Klasik',unknown:'Süre bilinmiyor'};
export function buildRepertoire(Chess,records){
 const groups=new Map();for(const r of records){const game=new Chess();if(!game.load_pgn(r.pgn))continue;const history=game.history({verbose:true}),headers=game.header();
 const replay=new Chess(headers.FEN||undefined);
 for(let i=0;i<Math.min(24,history.length);i++){
  const move=history[i];if(move.color===r.side){const fen=replay.fen(),key=r.side+'|'+fen.split(' ').slice(0,4).join(' '),uci=move.from+move.to+(move.promotion||'');
   let group=groups.get(key);if(!group){group={fen,side:r.side,samples:0,choices:new Map(),opening:r.opening||'Kendi oyunların'};groups.set(key,group);}
   group.samples++;let choice=group.choices.get(uci);if(!choice){choice={uci,san:move.san,games:0,scores:[],errors:0,best:null};group.choices.set(uci,choice);}choice.games++;
   const evidence=r.openingMoves?.find(m=>m.index===i&&m.uci===uci);if(Number.isFinite(evidence?.accuracy)){choice.scores.push(evidence.accuracy);choice.errors+=Number(evidence.loss>=.05);choice.best=evidence.best;}
  }replay.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
 }
 }return [...groups.values()].map(g=>({...g,choices:[...g.choices.values()].sort((a,b)=>b.games-a.games).map(c=>({...c,accuracy:c.scores.length?Math.round(c.scores.reduce((a,b)=>a+b,0)/c.scores.length*10)/10:null}))})).sort((a,b)=>b.samples-a.samples).slice(0,60);
}
export function progressGroups(records,group='all'){
 const filtered=records.filter(r=>group==='all'||timeGroup(r.timeControl)===group).sort((a,b)=>a.at-b.at),recent=filtered.slice(-20),previous=filtered.slice(-40,-20);
 const mean=a=>a.length?Math.round(a.reduce((n,r)=>n+r.accuracy,0)/a.length*10)/10:null;
 return {recent,previous,mean:mean(recent),previousMean:mean(previous),samples:filtered.length};
}
export const ENDGAME_LESSONS=[
 {id:'queen',title:'Vezirle mat',fen:'8/8/8/8/8/2K5/3Q4/k7 w - - 0 1',side:'w',goal:'win',text:'Pat yapmadan rakip şahın alanını daralt. Şahınla veziri destekle.'},
 {id:'rook',title:'Kaleyle mat',fen:'k7/8/2K5/8/8/8/8/7R w - - 0 1',side:'w',goal:'win',text:'Kaleyle sınır çiz; şahını yaklaştır ve rakibi kenara sıkıştır.'},
 {id:'pawn',title:'Geçer piyonu terfi ettir',fen:'8/3P4/2K5/8/8/8/8/7k w - - 0 1',side:'w',goal:'win',text:'Piyonunu terfi ettir; ardından pat yapmadan oyunu kazan.'},
 {id:'opposition',title:'Muhalefet ve beraberlik',fen:'8/8/4k3/4p3/4K3/8/8/8 w - - 0 1',side:'w',goal:'draw',text:'Rakip şahın ilerlemesini engelle. Beraberliği koruyarak sonuca ulaş.'},
 {id:'underpromotion',title:'Patı önleyen terfi',fen:'8/k1P5/2K5/8/8/8/8/8 w - - 0 1',side:'w',goal:'win',text:'Terfi seçeneklerini karşılaştır. Pat tehlikesine dikkat et.'}
];

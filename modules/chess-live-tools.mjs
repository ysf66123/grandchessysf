export function latestMove(game){return game.history({verbose:true}).at(-1)||null;}
export function markLastMove(square,name,last){square.classList.toggle('last-move-from',last?.from===name);square.classList.toggle('last-move-to',last?.to===name);}
export function premoveValid(game,pending,{id,uid,color,count,active,status}={}){
 if(!pending||pending.id!==id||pending.uid!==uid||status!=='active'||count-pending.count>2||count<=pending.count||!active||game.turn()!==color)return false;
 return game.moves({verbose:true}).some(m=>m.from===pending.from&&m.to===pending.to&&(m.promotion||'q')===pending.promotion);
}
export function rankStyledCandidates(Chess,fen,lines,style='balanced'){
 const values={p:1,n:3,b:3,r:5,q:9,k:0};
 return lines.map(l=>{
  const g=new Chess(fen),m=g.move({from:l.uci.slice(0,2),to:l.uci.slice(2,4),promotion:l.uci[4]||'q'});
  if(!m)return {...l,styleScore:-Infinity};
  const check=g.in_check()?3:0,capture=values[m.captured]||0;
  const center=['d4','e4','d5','e5'].includes(m.to)?2:0,castle=m.flags.includes('k')||m.flags.includes('q')?3:0;
  const score=style==='attacking'?check*3+capture*2+center:style==='defensive'?castle*3+(m.piece==='k'?-1:1)-capture*.2:
   style==='positional'?center*3+castle+(['b','n'].includes(m.piece)?2:0):0;
  return {...l,styleScore:score};
 }).sort((a,b)=>b.styleScore-a.styleScore||a.rank-b.rank);
}

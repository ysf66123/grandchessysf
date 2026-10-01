// Geometric motifs are displayed only along a legal, completed engine PV.
const value={p:100,n:320,b:330,r:500,q:900,k:20000};
const xy=s=>[s.charCodeAt(0)-97,Number(s[1])-1];
const square=(x,y)=>String.fromCharCode(97+x)+(y+1);
function attacks(game,from,to){
 const p=game.get(from);if(!p||from===to)return false;
 const [x,y]=xy(from),[a,b]=xy(to),dx=a-x,dy=b-y;
 if(p.type==='p')return Math.abs(dx)===1&&dy===(p.color==='w'?1:-1);
 if(p.type==='n')return Math.abs(dx)*Math.abs(dy)===2;
 if(p.type==='k')return Math.max(Math.abs(dx),Math.abs(dy))===1;
 const diagonal=Math.abs(dx)===Math.abs(dy),straight=dx===0||dy===0;
 if(!(p.type==='b'&&diagonal||p.type==='r'&&straight||p.type==='q'&&(diagonal||straight)))return false;
 const sx=Math.sign(dx),sy=Math.sign(dy);
 for(let a=x+sx,b=y+sy;a!==xy(to)[0]||b!==xy(to)[1];a+=sx,b+=sy)if(game.get(square(a,b)))return false;
 return true;
}
export function positionMotifs(Chess,fen,movedTo){
 const game=new Chess(fen),piece=game.get(movedTo);if(!piece)return [];
 const enemy=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){const s=square(x,y),p=game.get(s);if(p&&p.color!==piece.color)enemy.push({s,p});}
 const result=[],targets=enemy.filter(({s,p})=>(p.type==='k'||value[p.type]>=value[piece.type])&&attacks(game,movedTo,s));
 if(targets.length>=2)result.push({type:'fork',text:'Çatal tehdidi',arrows:targets.map(t=>[movedTo,t.s]),squares:targets.map(t=>t.s)});
 if(['b','r','q'].includes(piece.type))for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
  if(piece.type==='b'&&(dx===0||dy===0)||piece.type==='r'&&dx&&dy)continue;
  const [x,y]=xy(movedTo);let first;
  for(let a=x+dx,b=y+dy;a>=0&&a<8&&b>=0&&b<8;a+=dx,b+=dy){
   const s=square(a,b),p=game.get(s);if(!p)continue;if(p.color===piece.color)break;
   if(!first){first={s,p};continue;}
   if(p.type==='k')result.push({type:'pin',text:'Şaha açmaz',arrows:[[movedTo,s]],squares:[first.s,s]});
   else if(first.p.type==='k'||value[first.p.type]>value[p.type]&&value[p.type]>=320)result.push({type:'skewer',text:'Şiş tehdidi',arrows:[[movedTo,s]],squares:[first.s,s]});
   break;
  }
 }
 return result;
}
export function tacticalSequence(Chess,review,kind='played'){
 if(!review?.complete||review.stable===false)return [];
 const pv=kind==='best'?review.bestPv:review.playedPv;if(!pv?.length)return [];
 const game=new Chess(review.beforeFen),steps=[];
 for(let i=0;i<Math.min(12,pv.length);i++){
  const u=pv[i],move=game.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]});if(!move)break;
  const motifs=positionMotifs(Chess,game.fen(),move.to);
  if(move.san.includes('#'))motifs.unshift({type:'mate',text:'Şah mat',arrows:[[move.from,move.to]],squares:[move.to]});
  else if(move.san.includes('+'))motifs.push({type:'check',text:'Şah tehdidi',arrows:[[move.from,move.to]],squares:[move.to]});
  if(move.captured)motifs.push({type:'capture',text:'Taş alımı',arrows:[[move.from,move.to]],squares:[move.to]});
  if(move.promotion)motifs.push({type:'promotion',text:'Terfi',arrows:[[move.from,move.to]],squares:[move.to]});
  // A removed piece was a defender only when it attacked a later captured piece.
  const previous=steps[i-2];
  if(move.captured&&previous?.captured&&previous.color===move.color){
   const earlier=new Chess(previous.beforeFen);
   if(earlier.get(previous.to)?.color!==move.color&&attacks(earlier,previous.to,move.to))
    motifs.push({type:'defender',text:'Savunucunun kaldırılması',arrows:[[previous.from,previous.to],[move.from,move.to]],squares:[previous.to,move.to]});
  }
  const before=new Chess(review.beforeFen);for(const previous of pv.slice(0,i))before.move({from:previous.slice(0,2),to:previous.slice(2,4),promotion:previous[4]});
  steps.push({ply:i,color:move.color,uci:u,san:move.san,fen:game.fen(),beforeFen:before.fen(),from:move.from,to:move.to,captured:move.captured,motifs});
 }
 return steps;
}

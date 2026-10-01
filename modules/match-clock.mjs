export function appendMatchClock(source,move,elapsedMs,remainingMs){
 const history=Array.isArray(source.clockHistory)?source.clockHistory.filter(r=>r&&Number.isInteger(r.index)&&r.index<source.moveCount):[];
 if(!move||!Number.isInteger(source.moveCount)||!Number.isFinite(remainingMs))return history;
 return [...history,{index:source.moveCount,color:move.color,uci:move.from+move.to+(move.promotion||''),
  remainingMs:Math.max(0,remainingMs),elapsedMs:source.lastMoveTime&&Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):null}].slice(-600);
}

// All workspace data remains on this device and is isolated by Firebase UID.
export function createHistory(limit=30){
  let past=[],future=[],present=null;
  const clone=value=>JSON.parse(JSON.stringify(value));
  return {
    reset(value){past=[];future=[];present=clone(value);},
    record(value){if(JSON.stringify(value)===JSON.stringify(present))return; if(present)past.push(present);past=past.slice(-limit);future=[];present=clone(value);},
    undo(){if(!past.length)return null;future.push(present);present=past.pop();return clone(present);},
    redo(){if(!future.length)return null;past.push(present);present=future.pop();return clone(present);},
    get canUndo(){return past.length>0;},get canRedo(){return future.length>0;}
  };
}
export function readWorkspace(storage,owner){
  try{
    const raw=JSON.parse(storage.getItem('gm_wr_workspace_'+owner))||{};
    return {saved:(Array.isArray(raw.saved)?raw.saved:[]).filter(x=>typeof x.name==='string'&&x.draft).slice(0,8),
      feedback:(Array.isArray(raw.feedback)?raw.feedback:[]).filter(x=>x&&typeof x==='object').slice(-50)};
  }catch{return {saved:[],feedback:[]};}
}
export function writeWorkspace(storage,owner,value){
  try{storage.setItem('gm_wr_workspace_'+owner,JSON.stringify(value));return true;}catch{return false;}
}

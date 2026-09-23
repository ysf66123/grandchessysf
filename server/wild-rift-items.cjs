const source=require('./wild-rift-source.cjs');
async function enrichItems(items,{previous={},onProgress=()=>{}}={}){
  const catalog=source.parseItemCatalog(await source.fetchText(source.BASE+'/item-list'));
  const entries=catalog.entries.filter(e=>items[e.id]),checkedAt=new Date().toISOString();
  let cursor=0,done=0;const failures=[];
  async function worker(){
    while(cursor<entries.length){
      const entry=entries[cursor++];
      try{
        const url=source.BASE+`/ajax/tooltip?relation_type=Item&relation_id=${entry.sourceId}&lang=en`;
        const details=source.parseItemDetails(await source.fetchText(url),entry);
        Object.assign(items[entry.id],details,{costPatch:catalog.patch,costCheckedAt:checkedAt});
      }catch{
        failures.push(entry.id);const old=previous[entry.id];
        if(old?.cost)for(const key of ['cost','costSource','costPatch','costCheckedAt','stats'])items[entry.id][key]=old[key];
      }
      onProgress(++done,entries.length,entry.id);
      await new Promise(resolve=>setTimeout(resolve,160));
    }
  }
  await Promise.all([worker(),worker()]);
  return {patch:catalog.patch,checkedAt,source:catalog.source,priced:entries.length-failures.length,total:entries.length,failures,recipesAvailable:false};
}
module.exports={enrichItems};

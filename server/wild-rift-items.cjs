const source=require('./wild-rift-source.cjs');
async function enrichItems(items,{previous={},onProgress=()=>{}}={}){
  const catalog=source.parseItemCatalog(await source.fetchText(source.BASE+'/item-list'));
  for(const entry of catalog.entries)if(!items[entry.id])items[entry.id]={id:entry.id,name:entry.name,icon:entry.icon};
  const entries=catalog.entries.filter(e=>items[e.id]),checkedAt=new Date().toISOString();
  let cursor=0,done=0;const failures=[];
  async function worker(){
    while(cursor<entries.length){
      const entry=entries[cursor++];
      try{
        const url=source.BASE+`/ajax/tooltip?relation_type=Item&relation_id=${entry.sourceId}&lang=en`;
        const details=source.parseItemDetails(await source.fetchText(url),entry);
        Object.assign(items[entry.id],details,{costPatch:catalog.patch,costCheckedAt:checkedAt,statsPatch:catalog.patch,statsCheckedAt:checkedAt,effectsPatch:catalog.patch,effectsCheckedAt:checkedAt,effectsSource:url,mechanicsPatch:catalog.patch,mechanicsCheckedAt:checkedAt});
      }catch{
        failures.push(entry.id);const old=previous[entry.id];
        if(old?.cost)for(const key of ['cost','costSource','costPatch','costCheckedAt','stats','statsPatch','statsCheckedAt','effects','effectsPatch','effectsCheckedAt','effectsSource','mechanics','mechanicsPatch','mechanicsCheckedAt','coreFacts'])items[entry.id][key]=old[key];
      }
      onProgress(++done,entries.length,entry.id);
      await new Promise(resolve=>setTimeout(resolve,160));
    }
  }
  await Promise.all([worker(),worker()]);
  let coreFailed=false;
  try{const core=require('./wild-rift-build-sources.cjs').parseCoreItems(await source.fetchText('https://wildriftcore.com/en/items/'),items,checkedAt);
   for(const fact of core.items){if(!items[fact.id])items[fact.id]={id:fact.id,name:fact.name,icon:null};items[fact.id].coreFacts=fact;}
  }catch{coreFailed=true;for(const [id,i] of Object.entries(items))if(previous[id]?.coreFacts)i.coreFacts=previous[id].coreFacts;}
  return {patch:catalog.patch,checkedAt,source:catalog.source,entries:catalog.entries,priced:entries.length-failures.length,total:entries.length,failures,coreFailed,recipesAvailable:false};
}
module.exports={enrichItems};

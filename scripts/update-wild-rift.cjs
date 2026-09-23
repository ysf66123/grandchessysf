const {updateSnapshot}=require('../server/wild-rift-store.cjs');
updateSnapshot({force:process.argv.includes('--force'),onProgress:(n,total,id)=>{if(n%20===0 || n===total)console.log(`${n}/${total} rehber: ${id}`);}})
.then(d=>console.log(JSON.stringify({yama:d.latestPatch.version,istatistik:d.stats.asOf,sampiyon:d.champions.length,esya:Object.keys(d.items).length,eksik:d.failures},null,2)))
.catch(e=>{console.error(e.message);process.exitCode=1;});

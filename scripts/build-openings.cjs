// Regenerate the offline position index from the CC0 Lichess opening dataset.
const fs = require('node:fs');
const vm = require('node:vm');
async function main() {
    const context = {exports:{}};
    vm.runInNewContext(fs.readFileSync('vendor/chess-0.10.3.js','utf8'),context);
    const Chess=context.exports.Chess;
    const response=await fetch('https://api.github.com/repos/lichess-org/chess-openings/commits/master');
    if (!response.ok) throw Error('Cannot resolve opening dataset revision');
    const revision=(await response.json()).sha;
    const texts=await Promise.all(['a','b','c','d','e'].map(async volume=>{
        const r=await fetch('https://raw.githubusercontent.com/lichess-org/chess-openings/'+revision+'/'+volume+'.tsv');
        if(!r.ok)throw Error('Opening download failed');return r.text();
    }));
    const index={};let count=0;
    for(const text of texts)for(const row of text.trim().split('\n').slice(1)) {
        const [eco,name,pgn]=row.trim().split('\t');
        const game=new Chess();if(!game.load_pgn(pgn))throw Error('Invalid opening: '+name);
        const fields=game.fen().split(' ');
        if(fields[3]!=='-'&&!game.moves({verbose:true}).some(m=>m.flags.includes('e')))fields[3]='-';
        index[fields.slice(0,4).join(' ')]={eco,name};count++;
    }
    fs.writeFileSync('vendor/openings.json',JSON.stringify(index));
    fs.writeFileSync('vendor/openings-source.json',JSON.stringify({source:'https://github.com/lichess-org/chess-openings',revision,license:'CC0-1.0',entries:count,positions:Object.keys(index).length},null,2)+'\n');
    console.log('Indexed '+Object.keys(index).length+' opening positions at '+revision);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

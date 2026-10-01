// Read-only audit; no engine replacement or evaluation-network changes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
async function main(){const root=path.resolve(__dirname,'..'),wabt=await require(path.join(root,'.cache/speed2-tools/node_modules/wabt'))(),rows=[];
 for(const name of ['stockfish-18-lite-single.wasm','stockfish-18-lite.wasm']){const buffer=fs.readFileSync(path.join(root,'vendor',name));const wasm=wabt.readWasm(buffer,{readDebugNames:false,simd:true,threads:true,bulk_memory:true,reference_types:true});const text=wasm.toText({foldExprs:false,inlineExport:false});rows.push({name,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),simdInstructions:(text.match(/\b(?:v128|i8x16|i16x8|i32x4|i64x2|f32x4|f64x2)\./g)||[]).length,atomicInstructions:(text.match(/\.atomic\./g)||[]).length});wasm.destroy();}
 const result={engine:'Stockfish 18 Lite 18.0.5',networkUnchanged:true,rows};fs.writeFileSync(path.join(root,'.cache/speed2-build-audit.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}main().catch(e=>{console.error(e.message);process.exitCode=1;});

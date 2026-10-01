// Resource choices never change review depth, strength or candidate coverage.
export function engineProfile({cores=2,memory=0,mobile=false,isolated=false}={}) {
 const cpu=Math.max(1,Number(cores)||2),ram=Math.max(0,Number(memory)||0);
 return {threads:isolated&&!mobile?Math.min(2,Math.max(1,Math.floor(cpu/2))):1,
  hash:mobile?32:ram>=8?128:64,depthPolicy:'16 / 20–28',multiPv:3};
}
export function calibrationKey({cores=2,memory=0,mobile=false,isolated=false}={},backend='browser'){return 'gm_engine_calibration_v2_'+JSON.stringify([backend,cores,memory,mobile,isolated]);}
export function calibratedProfile(env={},backend='browser',storage=globalThis.localStorage){const fallback=engineProfile(env);if(backend==='native')fallback.threads=Math.min(2,Math.max(1,Math.floor((env.cores||2)/2)));try{const saved=JSON.parse(storage?.getItem(calibrationKey(env,backend))||'null'),maxThreads=backend==='native'||env.isolated&&!env.mobile?Math.min(4,Math.max(1,(env.cores||2)-1)):1,maxHash=env.mobile?32:env.memory>=8?256:64;
 if(saved?.version==='sf18-speed2'&&Date.now()-saved.at<30*86400000&&Number.isInteger(saved.threads)&&saved.threads>=1&&saved.threads<=maxThreads&&[32,64,128,256].includes(saved.hash)&&saved.hash<=maxHash&&saved.complete===true)return {...fallback,threads:saved.threads,hash:saved.hash};}catch{}return fallback;}
export function requestIdentity(fen,o={}) {
 return JSON.stringify([o.position||fen,o.depth||18,o.multiPv||3,o.searchmoves||[],o.legalCount,
  o.mode||'live',o.elo??null,o.skillLevel??20,o.reviewSession??null,o.requestId??null,o.timeoutMs??null]);
}
export class AnalysisTiming {
 constructor(){this.reset();}
 reset(){this.started=Date.now();this.samples={scan:[],verify:[]};this.completed=0;}
 add(stage,ms){if(this.samples[stage]&&ms>0){this.samples[stage].push(ms);this.samples[stage]=this.samples[stage].slice(-24);}}
 estimate(stage,left){const a=this.samples[stage]||[];if(a.length<3||left<1)return null;
  const sorted=[...a].sort((a,b)=>a-b),mid=sorted[Math.floor(sorted.length/2)];
  return {min:Math.max(1,Math.round(mid*left*.7/1000)),max:Math.max(2,Math.ceil(sorted[Math.floor((sorted.length-1)*.8)]*left*1.4/1000))};}
}

const http=require('node:http'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
function allowedOrigin(origin){return origin==='https://ysf66123.github.io'||/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin||'');}
function validCommand(command){if(typeof command!=='string'||command.length>16000||/[\r\n\0]/.test(command))return false;
 if(/^(uci|isready|stop|quit)$/.test(command))return true;
 if(command==='setoption name Clear Hash')return true;
 const option=command.match(/^setoption name (Hash|Threads|MultiPV|Skill Level|UCI_Elo|UCI_LimitStrength|UCI_ShowWDL) value (\d+|true|false)$/);
 if(option){const ranges={Hash:[16,256],Threads:[1,4],MultiPV:[1,8],'Skill Level':[0,20],UCI_Elo:[1320,3190]},range=ranges[option[1]];return range?Number(option[2])>=range[0]&&Number(option[2])<=range[1]:['true','false'].includes(option[2]);}
 if(/^position fen [prnbqkPRNBQK1-8\/]+ [wb] (?:-|[KQkq]+) (?:-|[a-h][36]) \d{1,4} \d{1,4}(?: moves(?: [a-h][1-8][a-h][1-8][nbrq]?){1,600})?$/.test(command))return true;
 const go=command.match(/^go depth (\d+)(?: searchmoves(?: [a-h][1-8][a-h][1-8][nbrq]?){1,8})?$/);return !!go&&Number(go[1])>=1&&Number(go[1])<=40;
}
function createBridge({binary=process.env.STOCKFISH_BINARY||findBinary(),spawnEngine=()=>spawn(binary,[],{windowsHide:true,stdio:['pipe','pipe','pipe']})}={}){
 const reviewCapable=!!binary&&fs.existsSync(binary);let reviewService;
 const getReviewService=async()=>{if(!reviewService)reviewService=import('./chess-review-service.mjs').then(({NativeReviewService})=>new NativeReviewService({binary,selective:true}));return reviewService;};
 const sessions=new Map();const destroy=id=>{const s=sessions.get(id);if(s){s.client?.end();s.child.kill();sessions.delete(id);}};
 const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;if(!allowedOrigin(origin)){res.writeHead(403);return res.end('Origin rejected');}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-GM-Engine');res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/events'&&req.method==='GET'){
   const s=sessions.get(url.searchParams.get('id'));if(!s||s.origin!==origin)return json(403,{error:'Session unavailable'});
   if(s.client)return json(409,{error:'Already connected'});res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': ready\n\n');s.client=res;
   for(const line of s.buffer)res.write('data: '+JSON.stringify(line)+'\n\n');s.buffer=[];req.on('close',()=>destroy(s.id));return;
  }
  if(req.headers['x-gm-engine']!=='1')return json(403,{error:'Header required'});
  if(url.pathname==='/health'&&req.method==='GET')return json(200,{ready:true,batch:true,review:reviewCapable?'native-pool-v1':false});
  if(url.pathname==='/review'&&reviewCapable&&(req.method==='GET'||req.method==='DELETE')){
   try{const service=await getReviewService(),id=url.searchParams.get('id');if(req.method==='DELETE'){const cancelled=await service.cancel(id,origin);return json(cancelled?200:404,{cancelled});}const job=service.get(id,origin);return json(job?200:404,job||{error:'Analiz bulunamadı.'});}catch(error){return json(503,{error:error.message});}
  }
  if(url.pathname==='/session'&&req.method==='DELETE'){const s=sessions.get(url.searchParams.get('id'));if(s?.origin===origin)destroy(s.id);return json(200,{closed:true});}
  if(req.method!=='POST')return json(404,{error:'Unknown endpoint'});
  let raw='';try{for await(const chunk of req){raw+=chunk;if(raw.length>(url.pathname==='/review'?270000:20000))return json(413,{error:'Too large'});}}catch{return;}
  let body;try{body=JSON.parse(raw);}catch{return json(400,{error:'Invalid JSON'});}
  if(!body||typeof body!=='object'||Array.isArray(body))return json(400,{error:'Invalid object'});
  if(url.pathname==='/review'&&reviewCapable){try{return json(200,await (await getReviewService()).start(body.pgn,origin,body.id));}catch(error){return json(error.status||400,{error:error.message});}}
  if(url.pathname==='/session'){
   if(sessions.size>=2)return json(429,{error:'Two sessions already active'});let child;try{child=spawnEngine();}catch{return json(503,{error:'Stockfish executable missing'});}
   const s={id:crypto.randomBytes(24).toString('hex'),child,origin,buffer:[],fragment:'',at:Date.now(),commands:[]};sessions.set(s.id,s);
   child.stdout.on('data',chunk=>{s.at=Date.now();s.fragment+=chunk;const lines=s.fragment.split(/\r?\n/);s.fragment=lines.pop();for(const line of lines){if(s.client)s.client.write('data: '+JSON.stringify(line)+'\n\n');else{s.buffer.push(line);s.buffer=s.buffer.slice(-100);}}});
   child.on('error',()=>destroy(s.id));child.on('exit',()=>destroy(s.id));child.stderr.on('data',()=>{});return json(200,{id:s.id,version:'Stockfish 18 Full',batch:true});
  }
  if(url.pathname==='/command'){
   const s=sessions.get(body.id);if(!s||s.origin!==origin)return json(403,{error:'Session unavailable'});const commands=body.commands||[body.command];if(!Array.isArray(commands)||!commands.length||commands.length>16||commands.some(c=>!validCommand(c)))return json(400,{error:'Command rejected'});
   s.commands=s.commands.filter(t=>Date.now()-t<1000);if(s.commands.length+commands.length>100)return json(429,{error:'Rate limit'});s.commands.push(...commands.map(()=>Date.now()));s.at=Date.now();s.child.stdin.write(commands.join('\n')+'\n');return json(200,{ok:true});
  }return json(404,{error:'Unknown endpoint'});
 });const cleanup=setInterval(()=>{for(const s of sessions.values())if(Date.now()-s.at>180000)destroy(s.id);reviewService?.then(s=>s.sweep()).catch(()=>{});},30000);cleanup.unref();server.on('close',()=>{clearInterval(cleanup);for(const id of sessions.keys())destroy(id);reviewService?.then(s=>s.close()).catch(()=>{});});return server;
}
function findBinary(){const root=path.resolve(__dirname,'../.cache/stockfish-native/stockfish');try{return fs.readdirSync(root).filter(n=>/^stockfish.*\.exe$/.test(n)).map(n=>path.join(root,n))[0];}catch{return undefined;}}
if(require.main===module){const binary=findBinary();if(!binary){console.error('Yerel Stockfish eksik. scripts/setup-native-engine.ps1 dosyasını çalıştır.');process.exitCode=1;}else createBridge({binary}).listen(8766,'127.0.0.1',()=>console.log('Stockfish 18 yerel motor hazır: 127.0.0.1:8766 · site ayarlarından seçebilirsin.'));}
module.exports={createBridge,validCommand,allowedOrigin};

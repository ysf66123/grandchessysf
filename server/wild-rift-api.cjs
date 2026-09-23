const {readSnapshot,updateSnapshot,getUpdateStatus}=require('./wild-rift-store.cjs');
const BOOTSTRAP_ADMIN='yusar646@gmail.com';
function adminClaims(token){
  const ids=(process.env.WR_ADMIN_UIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  // Preserve the existing site's admin account. Identity comes from the verified
  // Firebase token, never from a request body or an editable Firestore profile.
  return token?.admin===true || ids.includes(token?.uid) || String(token?.email||'').toLowerCase()===BOOTSTRAP_ADMIN;
}
async function verifyToken(token){
  const {getApps,initializeApp}=require('firebase-admin/app');
  if(!getApps().length)initializeApp({projectId:process.env.FIREBASE_PROJECT_ID||'chess-14580'});
  return require('firebase-admin/auth').getAuth().verifyIdToken(token);
}
function mountApi(app,{verify=verifyToken,store={readSnapshot,updateSnapshot,getUpdateStatus}}={}){
  const origins=(process.env.WR_ALLOWED_ORIGINS||'https://ysf66123.github.io').split(',').map(s=>s.trim());
  app.use('/api/wild-rift',(req,res,next)=>{
    const origin=req.headers.origin;
    const local=origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if(origin && !origins.includes(origin) && !local)return res.status(403).json({error:'Bu siteye erişim izni verilmemiş.'});
    if(origin){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    res.set('Cache-Control','private, no-store');
    if(req.method==='OPTIONS')return res.sendStatus(204);
    next();
  });
  // External schedulers can wake a sleeping host without a user's Firebase session.
  // The shared secret is server-only; the browser never receives it.
  app.post('/api/wild-rift/scheduled-refresh',async(req,res)=>{
    const secret=process.env.WR_SCHEDULER_SECRET,received=req.headers.authorization?.replace(/^Bearer /,'');
    if(!secret||secret.length<32)return res.status(503).json({error:'Dış zamanlayıcı yapılandırılmamış.'});
    const a=Buffer.from(secret),b=Buffer.from(received||'');
    if(a.length!==b.length||!require('node:crypto').timingSafeEqual(a,b))return res.status(401).json({error:'Zamanlayıcı yetkisi gerekli.'});
    try{const data=await store.updateSnapshot();res.json({ok:true,patch:data.latestPatch.version,checkedAt:data.checkedAt});}
    catch{res.status(503).json({error:'Kaynak güncellenemedi; son doğrulanmış veri korundu.'});}
  });
  app.use('/api/wild-rift',async(req,res,next)=>{
    const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if(!bearer)return res.status(401).json({error:'Yönetici oturumu gerekli.'});
    try{const token=await verify(bearer);if(!adminClaims(token))return res.status(403).json({error:'Yönetici yetkisi gerekli.'});req.wrAdmin=token.uid;next();}
    catch{return res.status(401).json({error:'Oturum doğrulanamadı. Yeniden giriş yap.'});}
  });
  let job=null,finishedAt=0,jobError=null;
  app.get('/api/wild-rift',async(req,res)=>{try{res.json(await store.readSnapshot());}catch{res.status(503).json({error:'Veri paketi henüz hazır değil.'});}});
  app.post('/api/wild-rift/refresh',(req,res)=>{
    if(!job && Date.now()-finishedAt>60000){
      jobError=null;
      job=store.updateSnapshot({force:true}).catch(e=>{jobError='Kaynak güncellenemedi; son doğrulanmış veri korundu.';console.error('[Wild Rift]',e.message);}).finally(()=>{job=null;finishedAt=Date.now();});
    }
    res.status(job?202:200).json({running:!!job,error:jobError});
  });
  app.get('/api/wild-rift/status',async(req,res)=>{
    try{const durable=store.getUpdateStatus?await store.getUpdateStatus():{};res.json({...durable,running:!!job||!!durable.running,finishedAt:Math.max(finishedAt,durable.finishedAt||0),error:(durable.finishedAt||0)>=finishedAt?durable.error||null:jobError||null});}
    catch{res.status(503).json({error:'Güncelleme durumu okunamadı.'});}
  });
  app.use('/api/wild-rift',(_,res)=>res.status(404).json({error:'İşlem bulunamadı.'}));
}
function scheduleUpdates(){
  const run=()=>updateSnapshot().catch(e=>console.error('[Wild Rift]',e.message));
  const start=setTimeout(run,10000);start.unref();
  const interval=setInterval(run,6*60*60*1000);interval.unref();
  return ()=>{clearTimeout(start);clearInterval(interval);};
}
module.exports={mountApi,scheduleUpdates,adminClaims};

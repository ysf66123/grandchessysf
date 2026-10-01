// GitHub Pages cannot set response headers. A same-origin service worker adds
// isolation for this app. Do not reload an active game or loop on failed setup.
(function(){
 if(!('serviceWorker' in navigator)||!isSecureContext||location.hostname!=='ysf66123.github.io')return;
 // Mobile Firebase sign-in uses third-party auth frames; keep the original
 // embedding policy there. Mobile analysis already uses the single-thread build.
 if(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)){
  let mobilePolicyReady=false;const probe=()=>navigator.serviceWorker.controller?.postMessage({type:'gm-policy-status'});
  const normalPolicy=()=>{const view=document.body?.dataset.activeView,active=[window.current1v1Data,window.current2v2Data].some(g=>g?.status==='active');if(mobilePolicyReady&&!active&&crossOriginIsolated&&['view-auth','view-dashboard','view-settings'].includes(view)&&!sessionStorage.getItem('gm-mobile-policy-v2')){sessionStorage.setItem('gm-mobile-policy-v2','1');location.reload();}};
  navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='gm-policy-status'&&e.data.version==='speed2'){mobilePolicyReady=true;normalPolicy();}});
  new MutationObserver(()=>{if(mobilePolicyReady)normalPolicy();else probe();}).observe(document.body,{attributes:true,attributeFilter:['data-active-view']});
  navigator.serviceWorker.getRegistration().then(reg=>{if(reg){reg.update().then(probe);navigator.serviceWorker.addEventListener('controllerchange',probe);}}).catch(()=>{});return;
 }
 navigator.serviceWorker.register('./engine-service-worker.js').then(reg=>{
  reg.update();
  if(crossOriginIsolated)return;
  const reload=()=>{
   if(sessionStorage.getItem('gm-isolation-reload-v1'))return;
   const view=document.body?.dataset.activeView;if(view&&!['view-auth','view-dashboard','view-settings'].includes(view))return;
   if([window.current1v1Data,window.current2v2Data].some(g=>g?.status==='active'))return;
   sessionStorage.setItem('gm-isolation-reload-v1','1');location.reload();
  };
  if(navigator.serviceWorker.controller)reload();
  else navigator.serviceWorker.addEventListener('controllerchange',reload,{once:true});
  new MutationObserver(()=>{if(navigator.serviceWorker.controller&&!crossOriginIsolated)reload();}).observe(document.body,{attributes:true,attributeFilter:['data-active-view']});
 }).catch(()=>{});
})();

// GitHub Pages cannot set response headers. A same-origin service worker adds
// isolation for this app. Do not reload an active game or loop on failed setup.
(function(){
 if(!('serviceWorker' in navigator)||!isSecureContext||location.hostname!=='ysf66123.github.io')return;
 navigator.serviceWorker.register('./engine-service-worker.js').then(reg=>{
  reg.update();
  if(crossOriginIsolated)return;
  const reload=()=>{
   if(sessionStorage.getItem('gm-isolation-reload-v1'))return;
   const view=document.body?.dataset.activeView;if(view&&!['view-auth','view-dashboard','view-settings'].includes(view))return;
   sessionStorage.setItem('gm-isolation-reload-v1','1');location.reload();
  };
  if(navigator.serviceWorker.controller)reload();
  else navigator.serviceWorker.addEventListener('controllerchange',reload,{once:true});
  new MutationObserver(()=>{if(navigator.serviceWorker.controller&&!crossOriginIsolated)reload();}).observe(document.body,{attributes:true,attributeFilter:['data-active-view']});
 }).catch(()=>{});
})();

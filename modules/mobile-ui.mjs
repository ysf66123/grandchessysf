// Only adds mobile navigation and adapts existing controls; desktop DOM restored.
const media=matchMedia('(max-width:760px)'),actions=document.querySelector('.top-bar-actions'),picker=actions?.querySelector('.theme-picker');
const anchor=document.createComment('theme-picker-original');picker?.before(anchor);
const theme=document.createElement('details');theme.className='mobile-theme-menu';
const summary=document.createElement('summary');summary.textContent='Tema';summary.setAttribute('aria-label','Görünüm temasını seç');theme.append(summary);
const dock=document.createElement('nav');dock.className='mobile-bottom-nav';dock.setAttribute('aria-label','Ana gezinme');
const icons={home:'<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z"/>',friends:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',story:'<path d="M4 5c3-1 5 0 8 2 3-2 5-3 8-2v14c-3-1-5 0-8 2-3-2-5-3-8-2Zm8 2v14"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="m9 3-.6 3-2 .9L3.5 6 2 9l2.5 2v2L2 15l1.5 3 2.9-.9 2 .9.6 3h6l.6-3 2-.9 2.9.9 1.5-3-2.5-2v-2L22 9l-1.5-3-2.9.9-2-.9L15 3Z"/>'};
for(const [label,view,icon]of [['Ana sayfa','view-dashboard','home'],['Arkadaşlar','view-friends','friends'],['Hikâye','view-story-mode','story'],['Ayarlar','view-settings','settings']]){
 const b=document.createElement('button');b.type='button';b.dataset.mobileView=view;b.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icons[icon]}</svg><span>${label}</span>`;
 b.onclick=()=>{
  theme.open=false;
  if(view==='view-settings')window.openSettings?.();
  else if(view==='view-story-mode')window.openStoryMode?.();
  else if(view==='view-friends'&&window.openFriendsView)window.openFriendsView();
  else window.switchView?.(view);
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
 };dock.append(b);
}document.body.append(dock);
function adapt(){
 if(media.matches){if(picker&&!theme.isConnected){theme.append(picker);actions.append(theme);}}
 else{if(picker&&theme.isConnected){anchor.after(picker);theme.remove();}}
 for(const b of dock.children){const active=b.dataset.mobileView===document.body.dataset.activeView;b.setAttribute('aria-current',active?'page':'false');}
}
media.addEventListener('change',adapt);
new MutationObserver(adapt).observe(document.body,{attributes:true,attributeFilter:['data-active-view']});adapt();
document.addEventListener('click',e=>{if(theme.open&&!theme.contains(e.target))theme.open=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')theme.open=false;});
// Preserve icon-only actions when icon fonts are unavailable, with accessible labels.
const labels={btnLogout:'Çıkış',btnNotifications:'Bildirimler'};
for(const b of document.querySelectorAll('button.icon-btn'))if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',b.title||labels[b.id]||'Ekran işlemi');
const iconPaths={
 'fa-arrow-left':'<path d="M20 12H4m7-7-7 7 7 7"/>',
 'fa-times':'<path d="m6 6 12 12M18 6 6 18"/>',
 'fa-bell':'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 20h4"/>',
 'fa-sign-out-alt':'<path d="M10 4H4v16h6m3-13 5 5-5 5m-4-5h12"/>',
 'fa-eye':'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 'fa-cog':icons.settings,
 'fa-arrow-down-wide-short':'<path d="M7 3v18m-4-4 4 4 4-4M14 5h7m-7 5h5m-5 5h3"/>',
 'fa-search-plus':'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>'
};
for(const b of document.querySelectorAll('button.icon-btn')){
 const i=b.querySelector('i'),name=i&&Object.keys(iconPaths).find(c=>i.classList.contains(c));if(!name)continue;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('mobile-icon-fallback');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('aria-hidden','true');svg.innerHTML=iconPaths[name];b.prepend(svg);
 if(b.getAttribute('aria-label')==='Ekran işlemi')b.setAttribute('aria-label',name==='fa-arrow-left'?'Geri dön':name==='fa-times'?'Kapat':'İncele');
}

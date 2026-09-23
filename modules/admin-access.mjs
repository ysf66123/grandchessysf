import {onIdTokenChanged} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
const BOOTSTRAP_ADMIN='yusar646@gmail.com';
let allowed=false,account=null,modulePromise=null;
export const isSiteAdmin=()=>allowed && !!window.currentUser && account===window.currentUser.uid;
window.isSiteAdmin=isSiteAdmin;
window.syncWildRiftAccess=async function(){
  const user=window.auth?.currentUser;
  allowed=false; account=user?.uid||null;
  if(user){
    try{const token=await user.getIdTokenResult();if(window.auth.currentUser?.uid===user.uid)allowed=token.claims.admin===true || (window.SITE_ADMIN_UIDS||[]).includes(user.uid) || user.email?.toLowerCase()===BOOTSTRAP_ADMIN;}
    catch{allowed=false;}
  }
  const card=document.getElementById('wildRiftEntryCard');if(card)card.hidden=!allowed;
  if(!allowed){document.getElementById('wr-root')?.replaceChildren();window.dispatchEvent(new CustomEvent('wr-access-revoked'));if(window.currentViewId==='view-wild-rift')window.switchView?.('view-dashboard');}
  return allowed;
};
window.openWildRift=async function(){
  if(!await window.syncWildRiftAccess())return window.showToast?.('Bu alan yalnızca yetkili yönetici hesaplarına açıktır.','error');
  const button=document.getElementById('wr-open');if(button)button.disabled=true;
  try{
    modulePromise ||= import('./wild-rift-ui.mjs?v=20260924-items1').catch(e=>{modulePromise=null;throw e;});
    const mod=await modulePromise;
    if(!isSiteAdmin())return;
    window.switchView('view-wild-rift');await mod.mount();
  }catch{window.showToast?.('Wild Rift paneli yüklenemedi. Yeniden deneyebilirsin.','error');}
  finally{if(button)button.disabled=false;}
};
onIdTokenChanged(window.auth,()=>window.syncWildRiftAccess());

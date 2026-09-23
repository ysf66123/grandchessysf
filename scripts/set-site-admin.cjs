// Requires trusted Firebase project credentials; never run this in the browser.
const uid=process.argv[2];
if(!uid){console.error('Kullanım: node scripts/set-site-admin.cjs FIREBASE_KULLANICI_UID');process.exit(1);}
require('firebase-admin/app').initializeApp({projectId:process.env.FIREBASE_PROJECT_ID||'chess-14580'});
const auth=require('firebase-admin/auth').getAuth();
auth.getUser(uid).then(user=>auth.setCustomUserClaims(uid,{...user.customClaims,admin:true}))
.then(()=>console.log('Yönetici yetkisi verildi. Hesaptan çıkıp yeniden giriş yapın.'))
.catch(e=>{console.error(e.message);process.exitCode=1;});

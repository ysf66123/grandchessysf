const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.pages-dist');
fs.mkdirSync(out,{recursive:true});
// Explicit allowlist: no server, credentials, caches, logs, or previous snapshots.
for(const name of ['index.html','app-v2.js','styles.css','analysis-premium.css','wild-rift.css','site-config.js','sitelogo.jpg'])fs.copyFileSync(path.join(root,name),path.join(out,name));
for(const name of ['modules','vendor','data'])fs.cpSync(path.join(root,name),path.join(out,name),{recursive:true,filter:src=>!path.basename(src).startsWith('.')&&!/\.(previous|tmp|log)$/.test(src)});
fs.appendFileSync(path.join(out,'site-config.js'),"\nwindow.WILD_RIFT_DATA_MODE = 'static';\n");
fs.writeFileSync(path.join(out,'.nojekyll'),'');
console.log('Statik GitHub Pages paketi hazır.');

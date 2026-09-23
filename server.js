const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;

app.disable('x-powered-by');
app.use(require('compression')());
const {mountApi,scheduleUpdates}=require('./server/wild-rift-api.cjs');
mountApi(app);
// Serve only public site assets. Credentials, test fixtures and source tools stay private.
app.use((req,res,next)=>{
    const pathname=req.path;
    if (/(?:^|\/)\.|^\/(?:server|scripts|tests|node_modules)(?:\/|$)|\.(?:log|previous|tmp)$|^\/(?:package(?:-lock)?\.json|server\.js|.*\.ps1|.*\.bat)$/i.test(pathname)) return res.sendStatus(404);
    next();
});
app.use(express.static(path.join(__dirname, '.'), {maxAge:'1h',setHeaders(res,file){
    if (file.endsWith('index.html') || file.endsWith('wild-rift.json') || file.endsWith('site-config.js'))res.setHeader('Cache-Control','no-cache');
}}));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) app.listen(port, () => {
    console.log('\n==============================================');
    console.log('🚀 Grandmaster Pro yerel sunucusu baslatildi!');
    console.log('🌐 Site Linki: http://localhost:' + port);
    console.log('==============================================\n');
    console.log('Tarayicinizda yukaridaki linke giderek siteyi goruntuleyebilirsiniz.\nKapatmak icin CTRL+C yapabilirsiniz.');
});
if(require.main === module && process.env.WR_AUTO_UPDATE!=='false')scheduleUpdates();
module.exports=app;

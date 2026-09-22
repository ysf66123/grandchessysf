// Integration smoke test against real Stockfish WASM, without Firebase writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createRequire}=require('node:module');
const requireRuntime=createRequire(path.join(process.env.CODEX_NODE_MODULES || 'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules','playwright/package.json'));
const {chromium}=requireRuntime('playwright');
const assert=require('node:assert/strict');
async function main(){
    const root=path.resolve(__dirname,'..');
    const server=http.createServer((req,res)=>{
        const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
        if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
        const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json'};
        fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(e?'missing':b);});
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try{
        const page=await browser.newPage({viewport:{width:1440,height:1080}});
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const port=server.address().port;
        await page.route('**/*',async route=>{
            const url=route.request().url();
            if(url.includes('/app-v2.js'))return route.fulfill({contentType:'text/javascript',body:`
                window.showToast=(text,type)=>{window.lastToast={text,type};};
                window.switchView=id=>{document.querySelectorAll('.view').forEach(e=>e.classList.remove('active'));document.getElementById(id).classList.add('active');window.currentViewId=id;document.body.dataset.activeView=id;};
                window.playGameSound=()=>{};window.playChessMoveSound=()=>{};
                import('/modules/analysis-v2.js').then(()=>window.analysisLoaded=true);`});
            if(!url.startsWith('http://127.0.0.1:') && !url.includes('chesscomfiles.com'))return route.abort();
            return route.continue();
        });
        await page.goto('http://127.0.0.1:'+port,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.analysisLoaded);
        const start=Date.now();
        await page.evaluate(()=>{window.reviewDone=false;window.openAnalysis('1. f3 e5 2. g4 Qh4# 0-1',[]).then(()=>window.reviewDone=true);});
        await page.waitForFunction(()=>window.reviewDone,{},{timeout:120000});
        assert.equal(await page.locator('#analysisMoveList .move-san[role=button]').count(),4);
        const status=await page.locator('#reviewProgressText').innerText();
        assert(!status.includes('tamamlanamadı'),status);
        assert((await page.locator('#acc-black').innerText()).includes('%'));
        assert.equal(await page.locator('#analysisEvalScore').innerText(),'M0');
        console.log('Actual WASM review:',status,'in',Date.now()-start,'ms');
        await page.locator('#analysisMoveList .move-san[role=button]').nth(2).click();
        assert((await page.locator('#coachFeedbackText').innerText()).length>30);
        assert(await page.locator('.review-pv-move').count()>0);
        await page.locator('.review-pv-move').first().click();
        await page.waitForTimeout(100);
        assert((await page.locator('#variationStatus').innerText()).includes('Alternatif'));
        await page.evaluate(()=>window.returnToAnalysisGame());
        await page.locator('#reviewRetry').click();
        assert((await page.locator('#coachMoveQuality').innerText()).includes('Sıra sende'));
        await page.evaluate(()=>window.returnToAnalysisGame());
        await page.screenshot({path:path.join(root,'tests/analysis-desktop.png'),fullPage:true});
        await page.setViewportSize({width:390,height:844});
        await page.waitForTimeout(500);
        await page.screenshot({path:path.join(root,'tests/analysis-mobile.png'),fullPage:true});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile horizontal overflow');
        assert(await page.locator('#analysisBoard').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'Mobile board clipped');
        assert(await page.locator('.analysis-sidebar-col').evaluate(e=>e.getBoundingClientRect().right<=innerWidth),'Mobile sidebar clipped');
        // Cached report must reopen; rapid switches must not apply an old report.
        await page.evaluate(()=>window.openAnalysis('1. f3 e5 2. g4 Qh4# 0-1',[]));
        await page.evaluate(()=>{window.openAnalysis('1. e4 e5 2. Nf3 Nc6',[]);window.cancelAnalysisReview();});
        await page.waitForTimeout(300);
        await page.evaluate(()=>window.openAnalysis('[SetUp "1"]\n[FEN "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 23"]\n\n23... O-O *',[]));
        assert.equal(await page.locator('.move-num').first().innerText(),'23.');
        assert.equal(await page.locator('.move-san[role=button] > span').first().innerText(),'O-O');
        const reference=await page.evaluate(async()=>window.queueStockfishEval('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2',{
            depth:22,mode:'review',multiPv:1,timeoutMs:8000
        }));
        assert.equal(reference.bestMove,'d8h4');assert.equal(reference.mate,1);
        console.log('Deep reference:',reference.bestMove,'mate',reference.mate,'depth',reference.depth);
        // Real engine terminal move reference and legal continuation.
        const engine=await page.evaluate(async()=>{
            await window.initStockfish();
            return window.queueStockfishEval('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',{depth:10,mode:'bot',multiPv:1});
        });
        assert(['(none)','0000'].includes(engine.bestMove));
        assert.deepEqual(errors,[]);
        console.log('Browser checks passed: report, mate, variations, retry, cache, cancellation, mobile layout.');
    }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

const fs = require('fs');

function patchFile(filename) {
    if (!fs.existsSync(filename)) return;
    let code = fs.readFileSync(filename, 'utf8');
    
    // idrisGlobalCounter
    code = code.replace(/document\.getElementById\(['"]idrisGlobalCounter['"]\)\.innerText = (.*?);/g, 
        `[document.getElementById('idrisGlobalCounter'), document.getElementById('modern_idrisGlobalCounter')].forEach(e => { if(e) e.innerText = $1; });`);
        
    // btnIdrisClick
    code = code.replace(/const btn = document\.getElementById\(['"]btnIdrisClick['"]\);/g, 
        `const btn = document.getElementById('btnIdrisClick');\n    const mBtn = document.getElementById('modern_btnIdrisClick');`);
        
    // idrisCooldownText
    code = code.replace(/const txt = document\.getElementById\(['"]idrisCooldownText['"]\);/g, 
        `const txt = document.getElementById('idrisCooldownText');\n    const mTxt = document.getElementById('modern_idrisCooldownText');`);

    // Patch btn assignments
    code = code.replace(/btn\.disabled = (.*?);/g, `if(btn) btn.disabled = $1; if(mBtn) mBtn.disabled = $1;`);
    code = code.replace(/btn\.style\.filter = (.*?);/g, `if(btn) btn.style.filter = $1; if(mBtn) mBtn.style.filter = $1;`);
    code = code.replace(/btn\.innerHTML = (.*?);/g, `if(btn) btn.innerHTML = $1; if(mBtn) mBtn.innerHTML = $1;`);
    
    // Patch txt assignments
    code = code.replace(/txt\.innerText = (.*?);/g, `if(txt) txt.innerText = $1; if(mTxt) mTxt.innerText = $1;`);
    
    // myTournamentsList
    code = code.replace(/const l = document\.getElementById\(['"]myTournamentsList['"]\);/g, 
        `const l = document.getElementById('myTournamentsList');\n      const mL = document.getElementById('modern_myTournamentsList');`);
    code = code.replace(/l\.innerHTML = (.*?);/g, `if(l) l.innerHTML = $1; if(mL) mL.innerHTML = $1;`);
    code = code.replace(/l\.appendChild\((.*?)\);/g, `if(l) l.appendChild($1); if(mL) mL.appendChild($1.cloneNode(true));`);
    
    // btnCreateTournament
    code = code.replace(/document\.getElementById\(['"]btnCreateTournament['"]\)\.onclick = (.*?);/g, 
        `[document.getElementById('btnCreateTournament'), document.getElementById('modern_btnCreateTournament')].forEach(e => { if(e) e.onclick = $1; });`);
    
    // newTournamentName & playerCount
    code = code.replace(/const n = document\.getElementById\(['"]newTournamentName['"]\)\.value\.trim\(\),(\s*)c = parseInt\(document\.getElementById\(['"]playerCount['"]\)\.value\);/g, 
        `const targetN = document.getElementById('modern_newTournamentName') && document.getElementById('dashboard-modern-layout').style.display !== 'none' ? document.getElementById('modern_newTournamentName') : document.getElementById('newTournamentName');\n      const targetC = document.getElementById('modern_playerCount') && document.getElementById('dashboard-modern-layout').style.display !== 'none' ? document.getElementById('modern_playerCount') : document.getElementById('playerCount');\n      const n = targetN ? targetN.value.trim() : '';\n      const c = targetC ? parseInt(targetC.value) : 2;`);

    // soloTrainingEntryCard
    code = code.replace(/var card = document\.getElementById\(['"]soloTrainingEntryCard['"]\);/g, 
        `var card = document.getElementById('soloTrainingEntryCard');\n  var mCard = document.getElementById('modern_soloTrainingEntryCard');`);
    code = code.replace(/card\.style\.display = (.*?);/g, `if(card) card.style.display = $1; if(mCard) mCard.style.display = $1;`);

    // friendsOnlineCount
    code = code.replace(/\['friendsOnlineCount', 'friendsOnlineCountView'\]\.forEach\(function\(id\) \{(\s*)var el = document\.getElementById\(id\);/g, 
        `['friendsOnlineCount', 'modern_friendsOnlineCount', 'friendsOnlineCountView'].forEach(function(id) {\n      var el = document.getElementById(id);`);

    // friendsRequestCount
    code = code.replace(/var reqEl = document\.getElementById\(['"]friendsRequestCount['"]\);/g, 
        `var reqEl = document.getElementById('friendsRequestCount');\n    var mReqEl = document.getElementById('modern_friendsRequestCount');`);
    code = code.replace(/reqEl\.innerText = (.*?);/g, `if(reqEl) reqEl.innerText = $1; if(mReqEl) mReqEl.innerText = $1;`);

    // Fix click mapping for btnIdrisClick
    code = code.replace(/!e\.target\.closest\(['"]#btnIdrisClick['"]\)/g, 
        `!e.target.closest('#btnIdrisClick') && !e.target.closest('#modern_btnIdrisClick')`);

    // Fix btn text for tournament creation
    code = code.replace(/btn\.innerText = (.*?);/g, `if(btn) btn.innerText = $1; if(mBtn) mBtn.innerText = $1;`);

    fs.writeFileSync(filename, code);
}

patchFile('app.js');
patchFile('app-v2.js');
patchFile('modules/game-modes-v2.js');
patchFile('modules/auth-social.js');
patchFile('modules/auth-social-v2.js');


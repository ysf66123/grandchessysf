const fs = require('fs');

function patch(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/document\.getElementById\(['"]btnCreateTournament['"]\)\.onclick = /g, 
        `const _createTournamentCb = `);
        
    if(code.includes('_createTournamentCb = async () => {')) {
        // Find the end of this statement or just append binding
        // Actually, replacing `document.getElementById("btnCreateTournament").onclick = async () => {` with a function and then binding it to both is better.
    }
}
// wait, I can just use a simpler sed for app.js and app-v2.js

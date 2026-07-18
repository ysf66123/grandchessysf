const fs = require('fs');

function revert(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');

    code = code.replace(/cardEif\(l\) l\.innerHTML = `([\s\S]*?)`; if\(mL\) mL\.innerHTML = `([\s\S]*?)`;/g, 
        (match, p1, p2) => `cardEl.innerHTML = \`${p1}\`;`);
        
    code = code.replace(/eif\(l\) l\.innerHTML = `([\s\S]*?)`; if\(mL\) mL\.innerHTML = `([\s\S]*?)`;/g, 
        (match, p1, p2) => `el.innerHTML = \`${p1}\`;`);
        
    fs.writeFileSync(file, code);
}
revert('app.js');
revert('app-v2.js');
revert('modules/game-modes-v2.js');

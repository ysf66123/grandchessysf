const fs = require('fs');

function fix(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');

    code = code.replace(/cardEif\(l\) l\.innerHTML = `([\s\S]*?)png'; if\(mL\) mL\.innerHTML = `([\s\S]*?)png';/g, 
        (match, p1, p2) => `cardEl.innerHTML = \`${p1}png';`);
        
    code = code.replace(/eif\(l\) l\.innerHTML = `<div style="font-size:2rem; if\(mL\) mL\.innerHTML = `<div style="font-size:2rem; margin-bottom:5px;"><i class="fas \$\{p\.avatar \|\| "fa-user"\}"><\/i><\/div>/g, 
        `el.innerHTML = \`<div style="font-size:2rem; margin-bottom:5px;"><i class="fas \${p.avatar || "fa-user"}"></i></div>`);

    fs.writeFileSync(file, code);
}
fix('app.js');
fix('app-v2.js');
fix('modules/game-modes-v2.js');

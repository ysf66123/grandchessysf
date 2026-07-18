const fs = require('fs');

function revert(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');

    // cardEif(l) l.innerHTML = `<div class="cr-elixir">${c.e}</div><img src="${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; if(mL) mL.innerHTML = `<div class="cr-elixir">${c.e}</div><img src="${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; this.style.filter='none';"><div class="cr-card-name">${c.n}</div>`;
    code = code.replace(/cardEif\(l\) l\.innerHTML = `([\s\S]*?)`; if\(mL\) mL\.innerHTML = `([\s\S]*?)`;/g, 
        (match, p1, p2) => `cardEl.innerHTML = \`${p1}\`;`);

    code = code.replace(/boardEif\(l\) l\.innerHTML = (.*?); if\(mL\) mL\.innerHTML = (.*?);/g, "boardEl.innerHTML = $1;");
    code = code.replace(/boardEif\(l\) l\.appendChild\((.*?)\); if\(mL\) mL\.appendChild\((.*?)\);/g, "boardEl.appendChild($1);");
    code = code.replace(/paneif\(l\) l\.appendChild\((.*?)\); if\(mL\) mL\.appendChild\((.*?)\);/g, "panel.appendChild($1);");
    code = code.replace(/eif\(l\) l\.innerHTML = html; if\(mL\) mL\.innerHTML = html;/g, "el.innerHTML = html;");
    
    // eif(l) l.innerHTML = `<div style="font-size:2rem; if(mL) mL.innerHTML = `<div style="font-size:2rem; margin-bottom:5px;"><i class="fas ${p.avatar || "fa-user"}"></i></div>
    code = code.replace(/eif\(l\) l\.innerHTML = `([\s\S]*?)`; if\(mL\) mL\.innerHTML = `([\s\S]*?)`;/g, 
        (match, p1, p2) => `el.innerHTML = \`${p1}\`;`);

    fs.writeFileSync(file, code);
}

revert('app.js');
revert('app-v2.js');
revert('modules/game-modes-v2.js');

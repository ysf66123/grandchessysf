const fs = require('fs');

function fixFile(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');
    
    // Reverse the bad replacement:
    // It replaced `l.innerHTML = (.*?);` with `if(l) l.innerHTML = $1; if(mL) mL.innerHTML = $1;`
    // So `cardEif(l) l.innerHTML = \`<div class="cr-elixir">\${c.e}</div><img src="\${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; if(mL) mL.innerHTML = \`<div class="cr-elixir">\${c.e}</div><img src="\${imgUrl}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/1068/1068729.png'; this.style.filter='none';"><div class="cr-card-name">\${c.n}</div>\`;`
    
    // Instead of regex, let's restore from git or undo carefully.
    // Let's just find `Eif(l) l.innerHTML = ` and ` if(mL) mL.innerHTML = `
    
    // Let's check how many occurrences
}

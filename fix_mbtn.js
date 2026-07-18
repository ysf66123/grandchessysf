const fs = require('fs');

function fix(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');

    code = code.replace(/if\s*\(\s*mBtn\s*\)/g, "if(typeof mBtn !== 'undefined' && mBtn)");
    
    fs.writeFileSync(file, code);
}
fix('app.js');
fix('app-v2.js');
fix('modules/game-modes-v2.js');
fix('modules/auth-social.js');
fix('modules/auth-social-v2.js');

const fs = require('fs');

function fix(file) {
    if(!fs.existsSync(file)) return;
    let code = fs.readFileSync(file, 'utf8');

    code = code.replace(/if\s*\(\s*mTxt\s*\)/g, "if(typeof mTxt !== 'undefined' && mTxt)");
    code = code.replace(/if\s*\(\s*mCard\s*\)/g, "if(typeof mCard !== 'undefined' && mCard)");
    code = code.replace(/if\s*\(\s*mReqEl\s*\)/g, "if(typeof mReqEl !== 'undefined' && mReqEl)");
    code = code.replace(/if\s*\(\s*mL\s*\)/g, "if(typeof mL !== 'undefined' && mL)");
    
    fs.writeFileSync(file, code);
}
fix('app.js');
fix('app-v2.js');
fix('modules/game-modes-v2.js');
fix('modules/auth-social.js');
fix('modules/auth-social-v2.js');

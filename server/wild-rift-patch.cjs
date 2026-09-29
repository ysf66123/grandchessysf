// Canonical gameplay versions only; dates and arbitrary text are not patches.
function normalizePatch(value){const m=String(value??'').trim().match(/^(\d+)\.(\d+)([a-z]?)$/i);return m?`${Number(m[1])}.${Number(m[2])}${m[3].toLowerCase()}`:null;}
module.exports={normalizePatch};

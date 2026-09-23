export function staticMode(){return !window.WILD_RIFT_API_BASE&&(window.WILD_RIFT_DATA_MODE==='static'||location.hostname.endsWith('.github.io'));}
export async function publishedSnapshot(signal){
 const response=await fetch(new URL('../data/wild-rift.json',import.meta.url),{cache:'no-cache',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean))});
 if(!response.ok)throw new Error('Yayımlanan veri paketine ulaşılamadı. Mevcut öneriler korunuyor.');
 return response.json();
}

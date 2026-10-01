export const REVIEW_STAGES=[
    {id:'prepare',title:'Motor ve maç hazırlanıyor',detail:'Hamle geçmişi ve açılış verileri yükleniyor.'},
    {id:'scan',title:'Bütün hamleler inceleniyor',detail:'Hamleler karşılaştırılıyor; kritik konumlar motor belleği hazırken derinleştiriliyor.'},
    {id:'verify',title:'Son kontroller yapılıyor',detail:'Derinlik, kapsam ve karar tutarlılığı kontrol ediliyor; eksik doğrulamalar tamamlanıyor.'},
    {id:'finish',title:'Rapor hazırlanıyor',detail:'Doğruluk ve hamle sınıfları son hesaplardan oluşturuluyor.'}
];
export function stageProgress(stage,done=0,total=1) {
    const bounds={prepare:[0,8],scan:[8,65],verify:[65,96],finish:[96,100]};
    const [start,end]=bounds[stage]||[0,0];
    const fraction=total>0?Math.max(0,Math.min(1,done/total)):1;
    return Math.round(start+(end-start)*fraction);
}
export function canRevealReport(reviews,total) {
    return total>0 && reviews.length===total && Array.from({length:total},(_,i)=>reviews[i]).every(r=>r && r.complete && r.stable!==false);
}

export const REVIEW_STAGES=[
    {id:'prepare',title:'Motor ve maç hazırlanıyor',detail:'Hamle geçmişi ve açılış verileri yükleniyor.'},
    {id:'scan',title:'Bütün hamleler inceleniyor',detail:'Oynanan hamleler en güçlü devamlarla karşılaştırılıyor.'},
    {id:'verify',title:'Kritik kararlar doğrulanıyor',detail:'Kayıplar, fedalar ve sınırdaki kararlar daha derin inceleniyor.'},
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

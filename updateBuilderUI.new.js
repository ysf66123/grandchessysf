window.activeQuizBuilderIndex = window.activeQuizBuilderIndex || 0;

function updateBuilderUI() {
    if (window.activeQuizBuilderIndex >= quizBuilderQuestions.length) {
        window.activeQuizBuilderIndex = quizBuilderQuestions.length - 1;
    }
    if (window.activeQuizBuilderIndex < 0) {
        window.activeQuizBuilderIndex = 0;
    }

    const container = document.getElementById('quizBuilderList');
    if (!container) return;
    container.innerHTML = "";
    
    const sidebar = document.getElementById('quizBuilderSidebar');
    const orderList = document.getElementById('quizBuilderOrderList');
    
    if (quizBuilderQuestions.length > 0) {
        if (sidebar) sidebar.style.display = 'flex';
        if (orderList) {
            orderList.innerHTML = '';
            quizBuilderQuestions.forEach((q, idx) => {
                const item = document.createElement('div');
                item.className = 'studio-slide-thumb ' + (idx === window.activeQuizBuilderIndex ? 'active' : '');
                item.draggable = true;
                const qTitle = q.q ? (q.q.length > 20 ? q.q.substring(0, 20) + '...' : q.q) : `Soru ${idx + 1}`;
                
                item.innerHTML = `
                    <div class="slide-num">${idx + 1}</div>
                    <div class="slide-content">
                        ${q.img ? `<img src="${q.img}" class="slide-mini-img">` : `<div class="slide-placeholder-img"><i class="fas fa-image"></i></div>`}
                        <div class="slide-text">${window.escapeHtml(qTitle)}</div>
                        <div class="slide-type-badge">${q.type === 'short' ? 'KISA CEVAP' : 'TEST'}</div>
                    </div>
                `;
                item.title = q.q || `Soru ${idx + 1}`;
                
                item.addEventListener('click', () => {
                    window.activeQuizBuilderIndex = idx;
                    updateBuilderUI();
                });
                
                item.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', idx);
                    item.classList.add('dragging');
                });
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });
                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                });
                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
                    if (fromIdx === idx || isNaN(fromIdx)) return;
                    
                    const movedItem = quizBuilderQuestions.splice(fromIdx, 1)[0];
                    quizBuilderQuestions.splice(idx, 0, movedItem);
                    window.activeQuizBuilderIndex = idx;
                    updateBuilderUI();
                });
                
                orderList.appendChild(item);
            });
        }
    } else {
        if (sidebar) sidebar.style.display = 'none';
        container.innerHTML = `<div style="text-align:center; padding:50px; color:rgba(255,255,255,0.5);">Henüz soru eklenmedi. Sol panelden yeni slayt ekleyin.</div>`;
    }

    quizBuilderQuestions.forEach((q, idx) => {
        q = normalizeQuizQuestion(q);
        quizBuilderQuestions[idx] = q;
        
        // Only render the active question
        if (idx !== window.activeQuizBuilderIndex) return;

        const div = document.createElement('div');
        div.className = 'studio-active-question-card';
        div.id = `quiz-builder-item-${idx}`;
        div.innerHTML = `
            <div class="studio-question-header">
                <div class="studio-question-title">Slayt ${idx + 1}</div>
                <div class="studio-question-actions">
                    <button class="icon-btn danger-text" onclick="removeQuestion(${idx})" title="Slaytı Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="icon-btn info-text" onclick="saveQuizQuestionToLibrary(${idx})" title="Kütüphaneye ekle">
                        <i class="fas fa-bookmark"></i>
                    </button>
                </div>
            </div>
            
            <div class="studio-question-body">
                <input type="text" class="studio-q-input" placeholder="Sorunuzu buraya yazın..." value="${escapeQuizAttr(q.q)}" oninput="updateQData(${idx}, 'q', this.value)">
                
                <div class="studio-media-upload">
                     ${q.img ? `<div class="media-success"><i class="fas fa-check-circle"></i> Resim Eklendi</div>` : `<div class="media-prompt"><i class="fas fa-cloud-upload-alt"></i> Medya Ekle (Opsiyonel)</div>`}
                     <input type="file" accept="image/png, image/jpeg" onchange="handleImageUpload(this, ${idx})">
                </div>
                <img src="${q.img}" class="q-img-preview studio-img-preview" id="preview-${idx}" onerror="this.style.display='none'">
                
                <div class="studio-options-grid">
                    ${q.type === 'short' ? [0,1,2,3].map(i => `
                        <div class="studio-opt-box">
                            <input type="text" class="studio-opt-input correct"
                                placeholder="Kabul Edilen Cevap ${i+1}"
                                value="${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                        </div>
                    `).join('') : [0,1,2,3].map(i => `
                        <div class="studio-opt-box ${q.correct===i ? 'is-correct' : ''}">
                            <input type="text" class="studio-opt-input"
                                placeholder="Seçenek ${['A','B','C','D'][i]}"
                                value="${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                            <label class="studio-correct-radio">
                                <input type="radio" name="correct-${idx}" ${q.correct===i?'checked':''}
                                    onclick="updateQData(${idx}, 'correct', ${i})" title="Doğru Cevap">
                                <span class="radio-mark"><i class="fas fa-check"></i></span>
                            </label>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="studio-question-footer">
                <div class="studio-setting-group">
                    <label>Soru Tipi</label>
                    <select onchange="updateQData(${idx}, 'type', this.value)">
                        <option value="multiple" ${q.type !== 'short' ? 'selected' : ''}>Çoktan Seçmeli (Test)</option>
                        <option value="short" ${q.type === 'short' ? 'selected' : ''}>Kısa Cevaplı</option>
                    </select>
                </div>
                <div class="studio-setting-group">
                    <label>Süre Sınırı</label>
                    <select onchange="updateQData(${idx}, 'time', this.value)">
                        <option value="10" ${q.time == 10 ? 'selected' : ''}>10 Saniye</option>
                        <option value="20" ${q.time == 20 ? 'selected' : ''}>20 Saniye</option>
                        <option value="30" ${q.time == 30 ? 'selected' : ''}>30 Saniye</option>
                        <option value="60" ${q.time == 60 ? 'selected' : ''}>1 Dakika</option>
                    </select>
                </div>
                <div class="studio-setting-group">
                    <label>Puan (TL)</label>
                    <input type="number" min="0" step="0.01" value="${q.value}" onchange="updateQData(${idx}, 'value', this.value)">
                </div>
            </div>
        `;
        container.appendChild(div);
        if(q.img) document.getElementById(`preview-${idx}`).style.display = 'block';
    });
    
    const sum = document.getElementById('builderSummary');
    if (sum) sum.innerText = `${quizBuilderQuestions.length}`;
}

function updateBuilderUI() {
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
                item.className = 'quiz-builder-order-item';
                item.draggable = true;
                const qTitle = q.q ? (q.q.length > 20 ? q.q.substring(0, 20) + '...' : q.q) : `Soru ${idx + 1}`;
                item.innerHTML = `<i class="fas fa-grip-vertical"></i> <span style="flex-grow: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${idx + 1}. ${window.escapeHtml(qTitle)}</span>`;
                item.title = q.q || `Soru ${idx + 1}`;
                
                item.addEventListener('click', () => {
                    const targetDiv = document.getElementById(`quiz-builder-item-${idx}`);
                    if (targetDiv) targetDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                    updateBuilderUI();
                });
                
                orderList.appendChild(item);
            });
        }
    } else {
        if (sidebar) sidebar.style.display = 'none';
    }

    quizBuilderQuestions.forEach((q, idx) => {
        q = normalizeQuizQuestion(q);
        quizBuilderQuestions[idx] = q;
        const div = document.createElement('div');
        div.className = 'quiz-builder-item';
        div.id = `quiz-builder-item-${idx}`;
        div.innerHTML = `
            <i class="fas fa-trash remove-q" onclick="removeQuestion(${idx})"></i>
            <button class="secondary quiz-library-save-btn" onclick="saveQuizQuestionToLibrary(${idx})" title="Kütüphaneye ekle">
                <i class="fas fa-bookmark"></i>
            </button>
            <div class="quiz-builder-title-row">
                <div>Soru ${idx + 1}</div>
                <select onchange="updateQData(${idx}, 'type', this.value)" style="padding: 5px; border-radius: 5px; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1);">
                    <option value="multiple" ${q.type !== 'short' ? 'selected' : ''}>Çoktan Seçmeli</option>
                    <option value="short" ${q.type === 'short' ? 'selected' : ''}>Kısa Cevaplı</option>
                </select>
                <label class="quiz-value-mini">
                    <span>Soru Değeri</span>
                    <input type="number" min="0" step="0.01" value="${q.value}" onchange="updateQData(${idx}, 'value', this.value)">
                    <b>TL</b>
                </label>
            </div>
            <input type="text" placeholder="Soru Metni Giriniz..." value="${escapeQuizAttr(q.q)}" oninput="updateQData(${idx}, 'q', this.value)" style="margin-bottom:5px;">

            <div class="file-upload-wrapper" style="font-size:0.8rem;">
                 ${q.img ? '<i class="fas fa-image" style="color:var(--success)"></i> Resim Yüklendi' : '<i class="fas fa-cloud-upload-alt"></i> Resim Yükle (İsteğe Bağlı)'}
                 <input type="file" accept="image/png, image/jpeg" onchange="handleImageUpload(this, ${idx})">
            </div>
            <img src="${q.img}" class="q-img-preview" id="preview-${idx}" onerror="this.style.display='none'">

            <div class="quiz-opt-grid">
                ${q.type === 'short' ? [0,1,2,3].map(i => `
                    <div style="position:relative;">
                        <input type="text" class="quiz-opt-input correct"
                            placeholder="Kabul Edilen Cevap ${i+1}"
                            value="${escapeQuizAttr(q.opts[i])}"
                            oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                    </div>
                `).join('') : [0,1,2,3].map(i => `
                    <div style="position:relative;">
                        <input type="text" class="quiz-opt-input ${q.correct===i?'correct':''}"
                            placeholder="Seçenek ${['A','B','C','D'][i]}"
                            value="${escapeQuizAttr(q.opts[i])}"
                            oninput="updateQData(${idx}, 'opt', this.value, ${i})">
                        <input type="radio" name="correct-${idx}" ${q.correct===i?'checked':''}
                            onclick="updateQData(${idx}, 'correct', ${i})"
                            style="position:absolute; right:5px; top:10px; width:20px; height:20px; cursor:pointer;" title="Doğru Cevap Olarak İşaretle">
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                <label style="font-size:0.8rem;">Süre (sn):</label>
                <input type="number" value="${q.time}" min="5" max="60" style="width:60px; text-align:center; margin:0;" onchange="updateQData(${idx}, 'time', this.value)">
                <span class="quiz-value-preview">${formatQuizMoney(q.value)}</span>
            </div>
        `;
        container.appendChild(div);
        if(q.img) document.getElementById(`preview-${idx}`).style.display = 'block';
    });

    const sum = document.getElementById('builderSummary');
    if (sum) sum.innerText = `${quizBuilderQuestions.length} Soru Eklendi`;
}

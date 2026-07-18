const fs = require('fs');
let code = fs.readFileSync('modules/game-modes-v2.js', 'utf8');

const startIndex = code.indexOf('function updateBuilderUI() {');
if (startIndex === -1) throw new Error("Could not find updateBuilderUI");

let openBrackets = 0;
let endIndex = -1;
for (let i = startIndex; i < code.length; i++) {
    if (code[i] === '{') openBrackets++;
    if (code[i] === '}') {
        openBrackets--;
        if (openBrackets === 0) {
            endIndex = i;
            break;
        }
    }
}

if (endIndex === -1) throw new Error("Could not find end of updateBuilderUI");

const replacement = `function updateBuilderUI() {
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
                item.className = 'studio-slide-thumb';
                item.draggable = true;
                const qTitle = q.q ? (q.q.length > 20 ? q.q.substring(0, 20) + '...' : q.q) : \`Soru \${idx + 1}\`;
                
                item.innerHTML = \`
                    <div class="slide-num">\${idx + 1}</div>
                    <div class="slide-content">
                        \${q.img ? \`<img src="\${q.img}" class="slide-mini-img">\` : \`<div class="slide-placeholder-img"><i class="fas fa-image"></i></div>\`}
                        <div class="slide-text">\${window.escapeHtml(qTitle)}</div>
                        <div class="slide-type-badge">\${q.type === 'short' ? 'KISA CEVAP' : 'TEST'}</div>
                    </div>
                \`;
                item.title = q.q || \`Soru \${idx + 1}\`;
                
                item.addEventListener('click', () => {
                    const targetDiv = document.getElementById(\`quiz-builder-item-\${idx}\`);
                    if (targetDiv) {
                        targetDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Highlight temporary
                        targetDiv.style.boxShadow = '0 0 20px var(--quiz-color)';
                        setTimeout(() => targetDiv.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)', 1000);
                    }
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
        container.innerHTML = \`<div style="text-align:center; padding:50px; color:rgba(255,255,255,0.5);">Henüz soru eklenmedi. Sol panelden yeni soru ekleyin.</div>\`;
    }

    quizBuilderQuestions.forEach((q, idx) => {
        q = normalizeQuizQuestion(q);
        quizBuilderQuestions[idx] = q;

        const div = document.createElement('div');
        div.className = 'studio-active-question-card';
        div.style.marginBottom = '30px';
        div.style.transition = 'box-shadow 0.3s ease';
        div.id = \`quiz-builder-item-\${idx}\`;
        div.innerHTML = \`
            <div class="studio-question-header">
                <div class="studio-question-title">Soru \${idx + 1}</div>
                <div class="studio-question-actions">
                    <button class="icon-btn danger-text" onclick="removeQuestion(\${idx})" title="Soruyu Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="icon-btn info-text" onclick="saveQuizQuestionToLibrary(\${idx})" title="Kütüphaneye ekle">
                        <i class="fas fa-bookmark"></i>
                    </button>
                </div>
            </div>
            
            <div class="studio-question-body">
                <input type="text" class="studio-q-input" placeholder="Soru Metni Giriniz..." value="\${escapeQuizAttr(q.q)}" oninput="updateQData(\${idx}, 'q', this.value)">
                
                <div class="studio-media-upload">
                     \${q.img ? \`<div class="media-success"><i class="fas fa-check-circle"></i> Resim Eklendi</div>\` : \`<div class="media-prompt"><i class="fas fa-cloud-upload-alt"></i> Medya Ekle (Opsiyonel)</div>\`}
                     <input type="file" accept="image/png, image/jpeg" onchange="handleImageUpload(this, \${idx})">
                </div>
                <img src="\${q.img}" class="q-img-preview studio-img-preview" id="preview-\${idx}" onerror="this.style.display='none'">
                
                <div class="studio-options-grid">
                    \${q.type === 'short' ? [0,1,2,3].map(i => \`
                        <div class="studio-opt-box">
                            <input type="text" class="studio-opt-input correct"
                                placeholder="Kabul Edilen Cevap \${i+1}"
                                value="\${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(\${idx}, 'opt', this.value, \${i})">
                        </div>
                    \`).join('') : [0,1,2,3].map(i => \`
                        <div class="studio-opt-box \${q.correct===i ? 'is-correct' : ''}">
                            <input type="text" class="studio-opt-input"
                                placeholder="Seçenek \${['A','B','C','D'][i]}"
                                value="\${escapeQuizAttr(q.opts[i])}"
                                oninput="updateQData(\${idx}, 'opt', this.value, \${i})">
                            <label class="studio-correct-radio">
                                <input type="radio" name="correct-\${idx}" \${q.correct===i?'checked':''}
                                    onclick="updateQData(\${idx}, 'correct', \${i})" title="Doğru Cevap">
                                <span class="radio-mark"><i class="fas fa-check"></i></span>
                            </label>
                        </div>
                    \`).join('')}
                </div>
            </div>

            <div class="studio-question-footer">
                <div class="studio-setting-group">
                    <label>Soru Tipi</label>
                    <select onchange="updateQData(\${idx}, 'type', this.value)">
                        <option value="multiple" \${q.type !== 'short' ? 'selected' : ''}>Çoktan Seçmeli</option>
                        <option value="short" \${q.type === 'short' ? 'selected' : ''}>Kısa Cevaplı</option>
                    </select>
                </div>
                <div class="studio-setting-group">
                    <label>Süre Sınırı (sn)</label>
                    <input type="number" min="5" max="60" value="\${q.time}" onchange="updateQData(\${idx}, 'time', this.value)">
                </div>
                <div class="studio-setting-group">
                    <label>Puan Değeri (TL)</label>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <input type="number" min="0" step="0.01" value="\${q.value}" onchange="updateQData(\${idx}, 'value', this.value)">
                        <span class="quiz-value-preview" style="font-weight:bold; color:var(--success);">\${formatQuizMoney(q.value)}</span>
                    </div>
                </div>
            </div>
        \`;
        container.appendChild(div);
        if(q.img) document.getElementById(\`preview-\${idx}\`).style.display = 'block';
    });
    
    const sum = document.getElementById('builderSummary');
    if (sum) sum.innerText = \`\${quizBuilderQuestions.length}\`;
}`;

// Also remove `window.activeQuizBuilderIndex = ...` before the function if it exists
let beforeCode = code.substring(0, startIndex);
beforeCode = beforeCode.replace(/window\.activeQuizBuilderIndex[\s\S]*?$/g, '');

const finalCode = beforeCode + replacement + code.substring(endIndex + 1);
fs.writeFileSync('modules/game-modes-v2.js', finalCode);

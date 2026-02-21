// ======================== Database Setup ========================
let db = null;
let SQL = null;

async function initDatabase() {
    try {
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm');
        const wasmBinary = await response.arrayBuffer();
        SQL = await initSqlJs({ wasmBinary });

        const existingDb = localStorage.getItem('dartCheckerDb');
        if (existingDb) {
            const binaryData = Uint8Array.from(atob(existingDb), c => c.charCodeAt(0));
            db = new SQL.Database(binaryData);
        } else {
            db = new SQL.Database();
            createTable();
        }
    } catch (err) {
        console.error('Database init error:', err);
    }
}

function createTable() {
    if (!db) return;
    db.run(`
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            total_score INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    saveDatabase();
}

function saveDatabase() {
    if (!db) return;
    try {
        const data = db.export();
        const binary = String.fromCharCode.apply(null, data);
        localStorage.setItem('dartCheckerDb', btoa(binary));
    } catch (err) {
        console.error('Save database error:', err);
    }
}

// ======================== State Management ========================
let categories = [];
let categoryHistory = [];
let historyIndex = -1;
let categoryScores = {};
let isDarkMode = localStorage.getItem('darkMode') === 'true';
let allResults = [];

// ======================== DOM Elements ========================
const alertBox = document.getElementById('alertBox');
const studentName = document.getElementById('studentName');
const keywordInput = document.getElementById('keywordInput');
const categoryName = document.getElementById('categoryName');
const categoryKeywords = document.getElementById('categoryKeywords');
const categoryMinCount = document.getElementById('categoryMinCount');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const clearCategoriesBtn = document.getElementById('clearCategoriesBtn');
const categoriesList = document.getElementById('categoriesList');
const dartCode = document.getElementById('dartCode');
const checkCodeBtn = document.getElementById('checkCodeBtn');
const clearCodeBtn = document.getElementById('clearCodeBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const resultPanel = document.getElementById('resultPanel');
const manualScoreInput = document.getElementById('manualScore');
const manualScoreSection = document.getElementById('manualScoreSection');
const dbButtonGroup = document.getElementById('dbButtonGroup');
const saveToDbBtn = document.getElementById('saveToDbBtn');
const showListBtn = document.getElementById('showListBtn');
const exportCSVBtn = document.getElementById('exportCSVBtn');
const exportPDFBtn = document.getElementById('exportPDFBtn');
const categoryFilter = document.getElementById('categoryFilter');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const helpBtn = document.getElementById('helpBtn');
const statsBtn = document.getElementById('statsBtn');
const listModal = document.getElementById('listModal');
const helpModal = document.getElementById('helpModal');
const statsModal = document.getElementById('statsModal');
const listCloseBtn = document.getElementById('listCloseBtn');
const helpCloseBtn = document.getElementById('helpCloseBtn');
const statsCloseBtn = document.getElementById('statsCloseBtn');
const listDoneBtn = document.getElementById('listDoneBtn');
const helpDoneBtn = document.getElementById('helpDoneBtn');
const statsDoneBtn = document.getElementById('statsDoneBtn');
const resultSearch = document.getElementById('resultSearch');
const sortResults = document.getElementById('sortResults');
const modalBody = document.getElementById('modalBody');
const statsBody = document.getElementById('statsBody');
const deleteListBtn = document.getElementById('deleteListBtn');
const lineCount = document.getElementById('lineCount');
const wordCount = document.getElementById('wordCount');
const charCount = document.getElementById('charCount');
const matchCount = document.getElementById('matchCount');
const templateOOPBtn = document.getElementById('templateOOPBtn');
const templateControlBtn = document.getElementById('templateControlBtn');
const templateTypeBtn = document.getElementById('templateTypeBtn');
const templateFuncBtn = document.getElementById('templateFuncBtn');

// ======================== Utility Functions ========================
function parseKeywords(input) {
    return input
        .trim()
        .split(/[\s,\n]+/)
        .filter(keyword => keyword.length > 0)
        .map(k => k.toLowerCase());
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showAlert(message, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} show`;
    alert.textContent = message;
    alertBox.appendChild(alert);
    setTimeout(() => alert.remove(), 4000);
}

function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Loading...';
    } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || btn.textContent;
    }
}

// ======================== Theme Management ========================
function initTheme() {
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        themeToggleBtn.textContent = '☀️';
    } else {
        themeToggleBtn.textContent = '🌙';
    }
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    localStorage.setItem('darkMode', isDarkMode);
    document.body.classList.toggle('dark-mode');
    themeToggleBtn.textContent = isDarkMode ? '☀️' : '🌙';
    showAlert(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled');
}

// ======================== Category History (Undo/Redo) ========================
function saveToHistory() {
    historyIndex++;
    categoryHistory = categoryHistory.slice(0, historyIndex);
    categoryHistory.push(JSON.parse(JSON.stringify(categories)));
    renderCategories();
    updateCategoryFilter();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        categories = JSON.parse(JSON.stringify(categoryHistory[historyIndex]));
        renderCategories();
        updateCategoryFilter();
        showAlert('↶ Undo successful');
    }
}

function redo() {
    if (historyIndex < categoryHistory.length - 1) {
        historyIndex++;
        categories = JSON.parse(JSON.stringify(categoryHistory[historyIndex]));
        renderCategories();
        updateCategoryFilter();
        showAlert('↷ Redo successful');
    }
}

// ======================== Quick Templates ========================
const templates = {
    oop: { name: 'OOP', keywords: ['class', 'extends', 'implements', 'interface', 'abstract', 'override', 'super', 'this'] },
    control: { name: 'Control Flow', keywords: ['if', 'else', 'switch', 'case', 'for', 'while', 'do', 'break', 'continue', 'return'] },
    types: { name: 'Types', keywords: ['int', 'string', 'bool', 'double', 'list', 'map', 'set', 'dynamic', 'var', 'final', 'const'] },
    functions: { name: 'Functions', keywords: ['void', 'function', 'async', 'await', 'yield', 'late', 'required', 'optional'] }
};

function loadTemplate(key) {
    const template = templates[key];
    if (!template) return;
    
    if (categories.some(cat => cat.name.toLowerCase() === template.name.toLowerCase())) {
        showAlert(`Template "${template.name}" already exists`, 'warning');
        return;
    }

    categories.push({
        name: template.name,
        keywords: template.keywords,
        minRequired: Math.ceil(template.keywords.length / 2)
    });
    
    saveToHistory();
    showAlert(`✓ Loaded template: ${template.name}`);
}

// ======================== Category Management ========================
function addCategory() {
    const name = categoryName.value.trim();
    const keywords = parseKeywords(categoryKeywords.value);
    const minCount = parseInt(categoryMinCount.value) || 1;

    if (!name) {
        showAlert('Please enter a category name', 'warning');
        categoryName.focus();
        return;
    }
    if (keywords.length === 0) {
        showAlert('Please enter at least one keyword', 'warning');
        categoryKeywords.focus();
        return;
    }
    if (minCount < 1 || minCount > keywords.length) {
        showAlert(`Min count must be between 1 and ${keywords.length}`, 'warning');
        categoryMinCount.focus();
        return;
    }
    if (categories.some(cat => cat.name.toLowerCase() === name.toLowerCase())) {
        showAlert('Category already exists', 'warning');
        return;
    }

    categories.push({ name, keywords, minRequired: minCount });
    saveToHistory();
    categoryName.value = '';
    categoryKeywords.value = '';
    categoryMinCount.value = '1';
    categoryName.focus();
    showAlert('✓ Category added successfully');
    updateCodeStats();
}

function removeCategory(index) {
    categories.splice(index, 1);
    saveToHistory();
}

function renderCategories() {
    categoriesList.innerHTML = '';
    if (categories.length === 0) return;

    categories.forEach((category, index) => {
        const tag = document.createElement('div');
        tag.className = 'category-tag';
        tag.innerHTML = `
            <div class="category-tag-content">
                <div class="category-tag-name">${escapeHtml(category.name)}</div>
                <div class="category-tag-keywords">${escapeHtml(category.keywords.join(', '))}</div>
                <div class="category-tag-mincount">Min: ${category.minRequired}</div>
            </div>
            <button class="btn btn-danger" onclick="removeCategory(${index})" style="padding: 4px 6px; font-size: 10px;">✕</button>
        `;
        categoriesList.appendChild(tag);
    });
}

function updateCategoryFilter() {
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = cat.name;
        categoryFilter.appendChild(option);
    });
}

// ======================== Code Analysis ========================
function updateCodeStats() {
    const code = dartCode.value;
    const lines = code.split('\n').length;
    const words = code.trim().split(/\s+/).filter(w => w).length;
    const chars = code.length;

    lineCount.textContent = lines;
    wordCount.textContent = words;
    charCount.textContent = chars;
}

function checkCode() {
    const code = dartCode.value;
    const allKeywords = parseKeywords(keywordInput.value);

    if (allKeywords.length === 0) {
        showAlert('Please enter keywords to check', 'warning');
        return;
    }
    if (categories.length === 0) {
        showAlert('Please add categories first', 'warning');
        return;
    }
    if (!code.trim()) {
        showAlert('Please paste Dart code to check', 'warning');
        return;
    }

    setLoading(checkCodeBtn, true);
    
    setTimeout(() => {
        categoryScores = {};
        let totalCategoryScore = 0;
        let totalMatches = 0;

        categories.forEach(category => {
            let matchCount = 0;
            category.keywords.forEach(keyword => {
                const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
                const matches = code.match(regex);
                if (matches) matchCount += matches.length;
            });

            const isPassed = matchCount >= category.minRequired;
            const categoryScore = isPassed ? 3 : 0;
            totalCategoryScore += categoryScore;
            totalMatches += matchCount;

            categoryScores[category.name] = {
                matched: matchCount,
                minRequired: category.minRequired,
                passed: isPassed,
                score: categoryScore
            };
        });

        matchCount.textContent = totalMatches;
        manualScoreInput.value = '0';
        manualScoreSection.style.display = 'flex';
        dbButtonGroup.style.display = 'flex';
        renderResults(totalCategoryScore);
        
        setLoading(checkCodeBtn, false);
        showAlert('✓ Code analysis complete');
    }, 200);
}

function renderResults(categoryScore) {
    const filteredCategory = categoryFilter.value;
    let html = '';

    categories.forEach(category => {
        if (filteredCategory && category.name !== filteredCategory) return;

        const score = categoryScores[category.name];
        const statusClass = score.passed ? 'passed' : 'failed';
        const statusText = score.passed ? 'PASSED' : 'FAILED';

        html += `
            <div class="result-section ${statusClass}">
                <div class="result-category-name">
                    ${escapeHtml(category.name)}
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="result-detail">Matched: <strong>${score.matched}</strong> / Keywords: <strong>${category.keywords.length}</strong></div>
                <div class="result-detail">Min Required: <strong>${score.minRequired}</strong></div>
                <div class="result-score">Score: <strong>+${score.score}</strong></div>
            </div>
        `;
    });

    const manualScore = parseInt(manualScoreInput.value) || 0;
    const finalScore = categoryScore + manualScore;

    html += `
        <div class="result-total">
            <div class="result-total-label">Final Score</div>
            <div class="result-total-value">${finalScore}</div>
            <div style="font-size: 11px; color: #666; margin-top: 6px;">
                Category: ${categoryScore} + Manual: ${manualScore >= 0 ? '+' : ''}${manualScore}
            </div>
        </div>
    `;

    resultPanel.innerHTML = html || '<div class="result-empty">Configure categories and check code to see results</div>';
}

// ======================== Drag & Drop ========================
function setupDragDrop() {
    dartCode.addEventListener('dragover', (e) => {
        e.preventDefault();
        dartCode.classList.add('drag-over');
    });

    dartCode.addEventListener('dragleave', () => {
        dartCode.classList.remove('drag-over');
    });

    dartCode.addEventListener('drop', (e) => {
        e.preventDefault();
        dartCode.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.dart') || file.name.endsWith('.txt')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    dartCode.value = event.target.result;
                    updateCodeStats();
                    showAlert(`✓ "${file.name}" loaded successfully`);
                    if (categories.length > 0 && parseKeywords(keywordInput.value).length > 0) {
                        checkCode();
                    }
                };
                reader.readAsText(file);
            } else {
                showAlert('Only .dart or .txt files are supported', 'warning');
            }
        }
    });
}

// ======================== Copy Code ========================
function copyCodeToClipboard() {
    if (!dartCode.value) {
        showAlert('Code area is empty', 'warning');
        return;
    }

    navigator.clipboard.writeText(dartCode.value).then(() => {
        copyCodeBtn.textContent = '✓ COPIED';
        setTimeout(() => {
            copyCodeBtn.textContent = 'COPY';
        }, 2000);
    }).catch(() => {
        showAlert('Failed to copy code', 'error');
    });
}

// ======================== Statistics ========================
function showStats() {
    updateCodeStats();
    const code = dartCode.value;
    const lines = code.split('\n').length;
    const words = code.trim().split(/\s+/).filter(w => w).length;
    
    let html = `
        <div class="stat-item">
            <div class="stat-label">Code Metrics</div>
            <div><strong>Lines:</strong> ${lines}</div>
            <div><strong>Words:</strong> ${words}</div>
            <div><strong>Characters:</strong> ${code.length}</div>
        </div>
    `;

    if (Object.keys(categoryScores).length > 0) {
        html += '<div class="stat-item"><div class="stat-label">Category Matches</div>';
        Object.entries(categoryScores).forEach(([name, score]) => {
            const status = score.passed ? '✓ PASSED' : '✗ FAILED';
            html += `<div><strong>${escapeHtml(name)}:</strong> ${score.matched} matches ${status}</div>`;
        });
        html += '</div>';
    }

    statsBody.innerHTML = html;
    statsModal.classList.add('show');
}

// ======================== Database Operations ========================
function saveToDatabase(name, score) {
    if (!db) return false;

    try {
        db.run('INSERT INTO results (name, total_score) VALUES (?, ?)', [name, score]);
        saveDatabase();
        return true;
    } catch (err) {
        console.error('Save error:', err);
        showAlert('Error saving to database', 'error');
        return false;
    }
}

function getResults() {
    if (!db) return [];
    try {
        const result = db.exec('SELECT * FROM results ORDER BY id DESC');
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            id: row[0],
            name: row[1],
            total_score: row[2],
            timestamp: row[3]
        }));
    } catch (err) {
        console.error('Get results error:', err);
        return [];
    }
}

function deleteAllResults() {
    if (!db) return false;
    try {
        db.run('DELETE FROM results');
        saveDatabase();
        return true;
    } catch (err) {
        showAlert('Error deleting records', 'error');
        return false;
    }
}

function saveResultToDb() {
    const name = studentName.value.trim();
    if (!name) {
        showAlert('Please enter your name first', 'warning');
        studentName.focus();
        return;
    }

    const manualScore = parseInt(manualScoreInput.value) || 0;
    let categoryScore = 0;
    Object.values(categoryScores).forEach(score => {
        categoryScore += score.score;
    });
    const finalScore = categoryScore + manualScore;

    setLoading(saveToDbBtn, true);
    
    setTimeout(() => {
        if (saveToDatabase(name, finalScore)) {
            showAlert('✓ Result saved successfully');
            manualScoreInput.value = '0';
        }
        setLoading(saveToDbBtn, false);
    }, 300);
}

// ======================== Results List Modal ========================
function showListModal() {
    allResults = getResults();

    if (allResults.length === 0) {
        modalBody.innerHTML = '<div class="modal-empty">No results stored yet. Save some results to see them here.</div>';
    } else {
        displayResultsTable(allResults);
    }

    listModal.classList.add('show');
}

function displayResultsTable(results) {
    if (results.length === 0) {
        modalBody.innerHTML = '<div class="modal-empty">No results match your search</div>';
        return;
    }

    let html = `
        <table class="modal-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Score</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(result => {
        const date = new Date(result.timestamp).toLocaleDateString();
        html += `
            <tr>
                <td>${result.id}</td>
                <td>${escapeHtml(result.name)}</td>
                <td><strong>${result.total_score}</strong></td>
                <td>${date}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    modalBody.innerHTML = html;
}

function filterAndSortResults() {
    let filtered = [...allResults];

    const searchTerm = resultSearch.value.toLowerCase().trim();
    if (searchTerm) {
        filtered = filtered.filter(r => r.name.toLowerCase().includes(searchTerm));
    }

    const sortBy = sortResults.value;
    switch (sortBy) {
        case 'date-asc':
            filtered.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            break;
        case 'name':
            filtered.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'score-desc':
            filtered.sort((a, b) => b.total_score - a.total_score);
            break;
        case 'score-asc':
            filtered.sort((a, b) => a.total_score - b.total_score);
            break;
        default:
            filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    displayResultsTable(filtered);
}

function deleteAllWithConfirmation() {
    const results = getResults();
    if (results.length === 0) {
        showAlert('No records to delete', 'warning');
        return;
    }

    if (confirm(`⚠️  Delete all ${results.length} record(s)? This cannot be undone.`)) {
        if (deleteAllResults()) {
            showAlert('✓ All records deleted');
            showListModal();
        }
    }
}

// ======================== Export Functions ========================
function exportToCSV() {
    const results = getResults();
    if (results.length === 0) {
        showAlert('No results to export', 'warning');
        return;
    }

    setLoading(exportCSVBtn, true);
    
    setTimeout(() => {
        let csv = 'ID,Name,Score,Date\n';
        results.forEach(r => {
            const date = new Date(r.timestamp).toLocaleDateString();
            csv += `${r.id},"${r.name.replace(/"/g, '""')}",${r.total_score},"${date}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `results_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showAlert('✓ CSV exported successfully');
        setLoading(exportCSVBtn, false);
    }, 300);
}

function exportToPDF() {
    const results = getResults();
    if (results.length === 0) {
        showAlert('No results to export', 'warning');
        return;
    }

    setLoading(exportPDFBtn, true);
    
    setTimeout(() => {
        let html = `
            <h2 style="text-align: center; margin-bottom: 20px;">Dart Code Keyword Categorizer - Results</h2>
            <table style="width:100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background-color: #f5f5f5;">
                        <th style="border: 1px solid #ddd; padding: 8px;">ID</th>
                        <th style="border: 1px solid #ddd; padding: 8px;">Name</th>
                        <th style="border: 1px solid #ddd; padding: 8px;">Score</th>
                        <th style="border: 1px solid #ddd; padding: 8px;">Date</th>
                    </tr>
                </thead>
                <tbody>
        `;

        results.forEach(r => {
            const date = new Date(r.timestamp).toLocaleDateString();
            html += `
                <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${r.id}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(r.name)}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${r.total_score}</td>
                    <td style="border: 1px solid #ddd; padding: 8px;">${date}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';

        const opt = {
            margin: 10,
            filename: `results_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
        };

        html2pdf().set(opt).from(html).save();
        showAlert('✓ PDF exported successfully');
        setLoading(exportPDFBtn, false);
    }, 300);
}

// ======================== Event Listeners ========================
addCategoryBtn.addEventListener('click', addCategory);
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
clearCategoriesBtn.addEventListener('click', () => {
    if (categories.length === 0) {
        showAlert('No categories to clear', 'warning');
        return;
    }
    if (confirm('Clear all categories?')) {
        categories = [];
        categoryHistory = [];
        historyIndex = -1;
        categoriesList.innerHTML = '';
        updateCategoryFilter();
        showAlert('✓ All categories cleared');
    }
});

categoryName.addEventListener('keypress', e => {
    if (e.key === 'Enter') categoryKeywords.focus();
});

categoryKeywords.addEventListener('keypress', e => {
    if (e.key === 'Enter') categoryMinCount.focus();
});

categoryMinCount.addEventListener('keypress', e => {
    if (e.key === 'Enter') addCategory();
});

checkCodeBtn.addEventListener('click', checkCode);
clearCodeBtn.addEventListener('click', () => {
    if (!dartCode.value) {
        showAlert('Code area is already empty', 'warning');
        return;
    }
    if (confirm('Clear all code?')) {
        dartCode.value = '';
        updateCodeStats();
        resultPanel.innerHTML = '<div class="result-empty">Configure categories and check code to see results</div>';
        manualScoreSection.style.display = 'none';
        dbButtonGroup.style.display = 'none';
        dartCode.focus();
        showAlert('✓ Code cleared');
    }
});

copyCodeBtn.addEventListener('click', copyCodeToClipboard);
dartCode.addEventListener('input', updateCodeStats);
dartCode.addEventListener('keypress', e => {
    if (e.ctrlKey && e.key === 'Enter') checkCode();
});

manualScoreInput.addEventListener('change', () => {
    let categoryScore = 0;
    Object.values(categoryScores).forEach(score => {
        categoryScore += score.score;
    });
    renderResults(categoryScore);
});

categoryFilter.addEventListener('change', () => {
    let categoryScore = 0;
    Object.values(categoryScores).forEach(score => {
        categoryScore += score.score;
    });
    renderResults(categoryScore);
});

saveToDbBtn.addEventListener('click', saveResultToDb);
showListBtn.addEventListener('click', showListModal);
exportCSVBtn.addEventListener('click', exportToCSV);
exportPDFBtn.addEventListener('click', exportToPDF);

statsCloseBtn.addEventListener('click', () => statsModal.classList.remove('show'));
statsDoneBtn.addEventListener('click', () => statsModal.classList.remove('show'));
listCloseBtn.addEventListener('click', () => listModal.classList.remove('show'));
listDoneBtn.addEventListener('click', () => listModal.classList.remove('show'));
helpCloseBtn.addEventListener('click', () => helpModal.classList.remove('show'));
helpDoneBtn.addEventListener('click', () => helpModal.classList.remove('show'));

deleteListBtn.addEventListener('click', deleteAllWithConfirmation);
resultSearch.addEventListener('input', filterAndSortResults);
sortResults.addEventListener('change', filterAndSortResults);

themeToggleBtn.addEventListener('click', toggleTheme);
helpBtn.addEventListener('click', () => helpModal.classList.add('show'));
statsBtn.addEventListener('click', showStats);

templateOOPBtn.addEventListener('click', () => loadTemplate('oop'));
templateControlBtn.addEventListener('click', () => loadTemplate('control'));
templateTypeBtn.addEventListener('click', () => loadTemplate('types'));
templateFuncBtn.addEventListener('click', () => loadTemplate('functions'));

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        statsModal.classList.remove('show');
        listModal.classList.remove('show');
        helpModal.classList.remove('show');
    }
    
    if (e.ctrlKey) {
        if (e.key === 'z') {
            e.preventDefault();
            undo();
        }
        if (e.key === 'y') {
            e.preventDefault();
            redo();
        }
        if (e.key === 'l') {
            e.preventDefault();
            dartCode.focus();
        }
    }
});

document.addEventListener('click', (e) => {
    if (e.target === statsModal) statsModal.classList.remove('show');
    if (e.target === listModal) listModal.classList.remove('show');
    if (e.target === helpModal) helpModal.classList.remove('show');
});

// ======================== Initialization ========================
async function init() {
    await initDatabase();
    initTheme();
    setupDragDrop();
    studentName.focus();
    showAlert('✓ Application loaded successfully');
}

window.addEventListener('load', init);

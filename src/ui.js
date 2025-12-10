// UI функції для відображення контенту DGST

// Відображення інформації про файл
export function displayFileInfo(element, fileName, fileSize) {
    element.innerHTML = `
        <strong>Файл:</strong> ${fileName}<br>
        <strong>Розмір:</strong> ${fileSize} KB
    `
    element.style.display = 'block'
}

// Відображення статистики DGST
export function displayStats(stats) {
    const container = document.getElementById('stats-container')
    
    if (!stats) {
        container.innerHTML = '<div class="loading">Завантажте файл для побудови дерева</div>'
        return
    }

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-label">Всього вузлів</div>
                <div class="stat-value">${stats.totalNodes || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Всього ребер</div>
                <div class="stat-value">${stats.totalEdges || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Максимальна глибина</div>
                <div class="stat-value">${stats.maxDepth || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Всього суфіксів</div>
                <div class="stat-value">${stats.totalSuffixes || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Кількість сплітів</div>
                <div class="stat-value">${stats.splits || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">S-префіксів</div>
                <div class="stat-value">${stats.sPrefixes ? stats.sPrefixes.length : 0}</div>
            </div>
            <div class="stat-item" style="grid-column: 1 / -1;">
                <div class="stat-label">Час побудови</div>
                <div class="stat-value">${stats.buildTime ? stats.buildTime.toFixed(2) + ' сек' : 'N/A'}</div>
            </div>
        </div>
    `
}

// Відображення результатів пошуку
export function displaySearchResults(container, query, results) {
    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="search-result-item">
                <div class="result-label">Нічого не знайдено</div>
                <div class="result-content">Слово "${query}" не знайдено в дереві</div>
            </div>
        `
        container.style.display = 'block'
        return
    }

    container.innerHTML = `
        <div style="margin-bottom: 10px; font-weight: bold; color: #555;">
            Знайдено: ${results.length} результатів для "${query}"
        </div>
        ${results.map((result, index) => `
            <div class="search-result-item">
                <div class="result-label">Результат #${index + 1} (позиція: ${result.position})</div>
                <div class="result-content">${result.context}</div>
            </div>
        `).join('')}
    `
    container.style.display = 'block'
}

// Відображення статусу (loading, success, error)
export function displayStatus(element, type, message) {
    if (!message) {
        element.innerHTML = ''
        return
    }

    let className = ''
    let icon = ''
    
    switch (type) {
        case 'loading':
            className = 'loading'
            icon = '⏳'
            break
        case 'success':
            className = 'success'
            icon = '✅'
            break
        case 'error':
            className = 'error'
            icon = '❌'
            break
    }

    element.innerHTML = `<div class="${className}">${icon} ${message}</div>`
}



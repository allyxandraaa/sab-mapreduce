export function displayFileInfo(element, fileName, fileSize) {
    element.innerHTML = `
        <strong>Файл:</strong> ${fileName}<br>
        <strong>Розмір:</strong> ${fileSize} KB
    `
    element.style.display = 'block'
}

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

export function displayPrefixes(container, prefixes) {
    if (!prefixes || prefixes.length === 0) {
        container.innerHTML = '<div class="loading">Префікси не знайдено</div>'
        return
    }

    const sorted = [...prefixes].sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length
        if (a.frequency !== b.frequency) return b.frequency - a.frequency
        return a.prefix.localeCompare(b.prefix)
    })

    container.innerHTML = `
        <div style="margin-bottom: 15px; font-weight: bold; color: #555; font-size: 16px;">
            Всього префіксів: ${prefixes.length}
        </div>
        <div style="max-height: 600px; overflow-y: auto; border: 1px solid #ddd; padding: 10px; border-radius: 4px; background: #f9f9f9;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #e0e0e0; position: sticky; top: 0;">
                        <th style="padding: 8px; text-align: left; border-bottom: 2px solid #999;">Префікс</th>
                        <th style="padding: 8px; text-align: center; border-bottom: 2px solid #999;">Довжина</th>
                        <th style="padding: 8px; text-align: right; border-bottom: 2px solid #999;">Частота</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map(sp => `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 6px; font-family: monospace; font-size: 14px;">${escapeHtml(sp.prefix)}</td>
                            <td style="padding: 6px; text-align: center;">${sp.length}</td>
                            <td style="padding: 6px; text-align: right; font-weight: bold;">${sp.frequency}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `
    container.style.display = 'block'
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}


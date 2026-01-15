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
            <div class="stat-item stat-item-full">
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
        <div class="search-results-summary">
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

export function displaySuffixTree(container, tree) {
    if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) {
        container.innerHTML = '<div class="loading">Глобальне суфіксне дерево недоступне</div>'
        return
    }

    if (typeof window === 'undefined' || typeof window.d3 === 'undefined') {
        container.innerHTML = '<div class="error">D3.js не завантажено. Неможливо побудувати візуалізацію.</div>'
        return
    }

    const d3 = window.d3
    const fullText = typeof tree.text === 'string' ? tree.text : null
    const tooltipId = 'suffix-tree-tooltip'
    let tooltip = document.getElementById(tooltipId)
    if (!tooltip) {
        tooltip = document.createElement('div')
        tooltip.id = tooltipId
        tooltip.className = 'tree-tooltip'
        document.body.appendChild(tooltip)
    }
    const hideTooltip = () => {
        tooltip.classList.remove('is-visible')
    }
    const showTooltip = (event, content) => {
        tooltip.textContent = content
        tooltip.style.left = `${event.pageX + 16}px`
        tooltip.style.top = `${event.pageY + 16}px`
        tooltip.classList.add('is-visible')
    }
    const updateTooltipPosition = (event) => {
        if (!tooltip.classList.contains('is-visible')) return
        tooltip.style.left = `${event.pageX + 16}px`
        tooltip.style.top = `${event.pageY + 16}px`
    }
    const formatNodeTooltip = (d) => {
        if (d.data.type === 'leaf') {
            const start = d.data.suffixStart ?? 0
            if (fullText && start >= 0 && start < fullText.length) {
                const suffix = fullText.slice(start)
                return `Suffix @ ${start}: ${suffix}`
            }
            return `Leaf starts at ${start}`
        }
        return `Depth: ${d.data.depth ?? 0}`
    }
    const nodesMap = new Map()
    tree.nodes.forEach(node => {
        nodesMap.set(node.id, { ...node, children: [], edgeLabel: '' })
    })

    const edges = Array.isArray(tree.edges) ? tree.edges : []
    edges.forEach(edge => {
        const parent = nodesMap.get(edge.from)
        const child = nodesMap.get(edge.to)
        if (parent && child) {
            child.edgeLabel = edge.labelPreview || `${edge.start}-${edge.end}`
            parent.children.push(child)
        }
    })

    let root = nodesMap.get(0)
    if (!root) {
        root = Array.from(nodesMap.values()).find(node => node.type === 'root') || nodesMap.values().next().value
    }

    if (!root) {
        container.innerHTML = '<div class="error">Не вдалося знайти корінь дерева для візуалізації.</div>'
        return
    }

    const nodeCount = tree.nodes.length
    const edgeCount = edges.length
    const suffixCount = tree.suffixCount || tree.nodes.filter(n => n.type === 'leaf').length

    container.innerHTML = `
        <div class="tree-panel">
            <div class="tree-panel-meta">
                <div><span>Вузлів</span>${nodeCount}</div>
                <div><span>Ребер</span>${edgeCount}</div>
                <div><span>Суфіксів</span>${suffixCount}</div>
            </div>
            <div class="tree-canvas">
                <svg class="tree-svg" aria-label="Suffix tree visualization"></svg>
            </div>
        </div>
    `

    const svgElement = container.querySelector('svg')
    const width = container.clientWidth || 900
    const height = 700
    const svg = d3.select(svgElement)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${width} ${height}`)

    const g = svg.append('g').attr('class', 'tree-layer')
    const zoom = d3.zoom().scaleExtent([0.2, 3]).on('zoom', (event) => {
        g.attr('transform', event.transform)
    })
    svg.call(zoom)

    const hierarchyRoot = d3.hierarchy(root, d => d.children)
    const treeLayout = d3.tree().nodeSize([60, 180])
    treeLayout(hierarchyRoot)

    let minX = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    hierarchyRoot.each(node => {
        if (node.x < minX) minX = node.x
        if (node.x > maxX) maxX = node.x
        if (node.y > maxY) maxY = node.y
    })
    const xOffset = (width - (maxX - minX)) / 2 - minX
    hierarchyRoot.each(node => {
        node.x += xOffset
        node.y += 80
    })

    const linkGenerator = d3.linkVertical().x(d => d.x).y(d => d.y)
    const links = hierarchyRoot.links()
    links.forEach((link, index) => { link.__linkId = index })

    g.append('g')
        .attr('class', 'tree-links')
        .selectAll('path')
        .data(links)
        .join('path')
        .attr('class', 'tree-link')
        .attr('id', d => `tree-link-${d.__linkId}`)
        .attr('d', linkGenerator)

    const linkLabelData = links.filter(link => (link.target.data.edgeLabel || '').length > 0)
    const linkLabels = g.append('g')
        .attr('class', 'tree-link-labels')
        .selectAll('text')
        .data(linkLabelData)
        .join('text')
        .attr('class', 'tree-link-label')
        .attr('text-anchor', 'middle')

    linkLabels.append('textPath')
        .attr('href', d => `#tree-link-${d.__linkId}`)
        .attr('startOffset', '50%')
        .text(d => {
            const label = d.target.data.edgeLabel || ''
            if (label.length > 28) {
                return label.slice(0, 28) + '…'
            }
            return label
        })

    linkLabels.append('title').text(d => d.target.data.edgeLabel || '')

    const nodeGroup = g.append('g')
        .attr('class', 'tree-nodes')
        .selectAll('g')
        .data(hierarchyRoot.descendants())
        .join('g')
        .attr('class', 'tree-node')
        .attr('transform', d => `translate(${d.x}, ${d.y})`)

    nodeGroup.append('circle')
        .attr('r', d => d.data.type === 'leaf' ? 4 : 6)

    nodeGroup.append('text')
        .attr('class', 'tree-node-label')
        .attr('dy', -10)
        .attr('text-anchor', 'middle')
        .text(d => {
            if (d.data.type === 'leaf' && Number.isInteger(d.data.suffixStart)) {
                return `#${d.data.suffixStart}`
            }
            return d.data.id ?? ''
        })

    nodeGroup
        .on('mouseenter', (event, d) => {
            showTooltip(event, formatNodeTooltip(d))
        })
        .on('mousemove', (event) => {
            updateTooltipPosition(event)
        })
        .on('mouseleave', () => {
            hideTooltip()
        })

    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, 40))
    container.style.display = 'block'
}

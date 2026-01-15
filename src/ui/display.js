export function displayFileInfo(element, fileName, fileSize) {
    element.innerHTML = `
        <strong>Файл:</strong> ${fileName}<br>
        <strong>Розмір:</strong> ${fileSize} KB
    `
    element.style.display = 'block'
}

export function displayStatus(element, type, message) {
    if (!element) {
        return
    }

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

export function displayStats(stats) {
    const container = document.getElementById('stats-container')
    if (!container) {
        return
    }

    if (!stats) {
        container.innerHTML = '<div class="loading">Завантажте файл для побудови дерева</div>'
        return
    }

    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-label">Всього вузлів</div>
                <div class="stat-value">${stats.totalNodes ?? 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Всього ребер</div>
                <div class="stat-value">${stats.totalEdges ?? 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Максимальна глибина</div>
                <div class="stat-value">${stats.maxDepth ?? 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Всього суфіксів</div>
                <div class="stat-value">${stats.totalSuffixes ?? 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">S-префіксів</div>
                <div class="stat-value">${stats.sPrefixes?.length ?? 0}</div>
            </div>
            <div class="stat-item stat-item-full">
                <div class="stat-label">Час побудови</div>
                <div class="stat-value">${stats.buildTime ? stats.buildTime.toFixed(2) + ' сек' : 'N/A'}</div>
            </div>
        </div>
    `
}

export function displaySubTreeVisualization(subTrees, targetContainer = document.getElementById('subtrees-visualization'), sourceText = '') {
    if (!targetContainer) {
        return
    }

    if (!Array.isArray(subTrees) || subTrees.length === 0) {
        targetContainer.innerHTML = '<div class="loading">Піддерева ще не сформовані</div>'
        return
    }

    if (typeof window === 'undefined' || typeof window.d3 === 'undefined') {
        targetContainer.innerHTML = '<div class="error">D3.js недоступний для візуалізації</div>'
        return
    }

    const d3 = window.d3
    const normalizedText = typeof sourceText === 'string' ? sourceText : ''
    const containerWidth = targetContainer.clientWidth || 1100

    targetContainer.innerHTML = ''

    const tooltip = ensureTooltip()
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10)

    subTrees.forEach((groupResult, index) => {
        const groupTree = groupResult?.groupTree
        if (!groupTree || !Array.isArray(groupTree.nodes) || groupTree.nodes.length === 0) {
            return
        }

        const groupWrapper = document.createElement('div')
        groupWrapper.className = 'subtree-group-wrapper'

        const groupTitle = document.createElement('div')
        groupTitle.className = 'subtree-group-title'
        const displayNumber = groupResult?.displayIndex ?? (index + 1)
        groupTitle.textContent = `Група #${displayNumber}`

        const groupMeta = document.createElement('div')
        groupMeta.className = 'subtree-group-meta'
        const suffixCount = groupResult?.treeCount ?? groupTree.nodes.length ?? 0
        groupMeta.textContent = `Вузлів: ${groupTree.nodes.length || 0} · Піддерев: ${suffixCount}`

        const canvasWrapper = document.createElement('div')
        canvasWrapper.className = 'subtree-group-canvas'
        const canvas = document.createElement('div')
        canvas.className = 'subtree-group-canvas-inner'
        canvasWrapper.appendChild(canvas)

        groupWrapper.appendChild(groupTitle)
        groupWrapper.appendChild(groupMeta)
        groupWrapper.appendChild(canvasWrapper)
        targetContainer.appendChild(groupWrapper)

        const hierarchyData = convertTreeToHierarchy(groupTree)
        if (!hierarchyData) {
            canvas.innerHTML = '<div class="error">Не вдалося побудувати цю групу</div>'
            return
        }

        const hierarchyRoot = d3.hierarchy(hierarchyData, d => d.children)
        const leaves = Math.max(1, hierarchyRoot.leaves().length)
        const depth = Math.max(1, hierarchyRoot.height)
        const leafSpacing = 38
        const levelSpacing = 80
        const innerWidth = Math.max(containerWidth - 120, leaves * leafSpacing)
        const innerHeight = Math.max(320, depth * levelSpacing + 80)
        const margin = { top: 40, right: 40, bottom: 20, left: 60 }
        const svgWidth = innerWidth + margin.left + margin.right
        const svgHeight = innerHeight + margin.top + margin.bottom

        canvas.style.width = `${svgWidth}px`

        const svg = d3.select(canvas)
            .append('svg')
            .attr('class', 'subtree-svg zoomable')
            .attr('width', svgWidth)
            .attr('height', svgHeight)

        const zoomLayer = svg.append('g')
        const plot = zoomLayer.append('g')
            .attr('transform', `translate(${margin.left}, ${margin.top})`)

        const zoomBehavior = d3.zoom()
            .scaleExtent([0.5, 4])
            .on('zoom', (event) => {
                zoomLayer.attr('transform', event.transform)
            })

        svg.call(zoomBehavior)

        const resetBtn = document.createElement('button')
        resetBtn.type = 'button'
        resetBtn.className = 'subtree-reset-btn'
        resetBtn.textContent = '⟳'
        resetBtn.title = 'Скинути панорамування'
        resetBtn.setAttribute('aria-label', 'Скинути панорамування')
        resetBtn.addEventListener('click', () => {
            svg.transition().duration(200).call(zoomBehavior.transform, d3.zoomIdentity)
        })
        canvasWrapper.appendChild(resetBtn)

        const treeLayout = d3.tree().size([innerWidth, innerHeight])
        treeLayout(hierarchyRoot)

        const linkGenerator = d3.linkVertical().x(d => d.x).y(d => d.y)
        const linkData = hierarchyRoot.links().map((link, linkIndex) => ({
            ...link,
            __id: `subtree-link-${groupResult?.groupId ?? index}-${linkIndex}`
        }))

        plot.append('g')
            .attr('class', 'subtree-links')
            .selectAll('path')
            .data(linkData)
            .join('path')
            .attr('id', d => d.__id)
            .attr('d', linkGenerator)
            .attr('stroke', 'rgba(148, 163, 184, 0.5)')
            .attr('stroke-width', 1.2)
            .attr('fill', 'none')

        const canShowLabels = innerWidth / leaves > 28
        if (canShowLabels) {
            const labelGroup = plot.append('g').attr('class', 'subtree-link-labels')
            const labelData = linkData.filter(link => {
                const textValue = buildSuffixPreview(link.target, normalizedText, 32)
                if (!textValue) {
                    return false
                }
                const dx = link.target.x - link.source.x
                const dy = link.target.y - link.source.y
                const segmentLength = Math.sqrt(dx * dx + dy * dy)
                return segmentLength >= 45
            }).map(link => ({
                ...link,
                labelText: buildSuffixPreview(link.target, normalizedText, 32)
            }))

            labelGroup.selectAll('text')
                .data(labelData)
                .join('text')
                .attr('class', 'subtree-link-label on-path')
                .append('textPath')
                .attr('href', d => `#${d.__id}`)
                .attr('startOffset', '50%')
                .attr('method', 'stretch')
                .attr('side', 'left')
                .text(d => d.labelText)
        }

        const nodes = plot.append('g')
            .attr('class', 'subtree-nodes')
            .selectAll('g')
            .data(hierarchyRoot.descendants())
            .join('g')
            .attr('transform', d => `translate(${d.x}, ${d.y})`)

        nodes.append('circle')
            .attr('r', d => (d.data.type === 'leaf' ? 4.2 : 6.5))
            .attr('fill', colorScale(index))
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 0.9)

        nodes.on('mouseenter', (event, d) => {
            showTooltip(event, tooltip, formatTooltip(d, groupResult, normalizedText))
        }).on('mousemove', (event) => {
            moveTooltip(event, tooltip)
        }).on('mouseleave', () => {
            hideTooltip(tooltip)
        })
    })
}

function convertTreeToHierarchy(tree) {
    const nodesMap = new Map()
    tree.nodes.forEach(node => {
        nodesMap.set(node.id, { ...node, children: [], edgeLabel: '' })
    })

    if (Array.isArray(tree.edges)) {
        tree.edges.forEach(edge => {
            const parent = nodesMap.get(edge.from)
            const child = nodesMap.get(edge.to)
            if (parent && child) {
                child.edgeLabel = edge.labelPreview || ''
                parent.children.push(child)
                child.parentId = parent.id
            }
        })
    }

    let root = nodesMap.get(0)
    if (!root) {
        root = Array.from(nodesMap.values()).find(node => node.type === 'group-root' || node.type === 'root')
    }
    return root
}

function formatTooltip(node, groupResult, sourceText) {
    if (node.data.type === 'leaf') {
        const suffix = getFullSuffix(node, sourceText)
        return `Група #${groupResult?.displayIndex ?? groupResult?.groupId ?? '?'}\nСуфікс: ${suffix || 'невідомо'}`
    }
    return `Вузол рівня ${node.depth || 0}`
}

function buildSuffixPreview(node, sourceText, maxLength = 32) {
    if (sourceText && typeof node?.data?.suffixStart === 'number') {
        const preview = sourceText.slice(node.data.suffixStart, node.data.suffixStart + maxLength)
        return preview.trim()
    }
    if (node?.data?.edgeLabel) {
        return node.data.edgeLabel.slice(0, maxLength)
    }
    return ''
}

function getFullSuffix(node, sourceText) {
    if (sourceText && typeof node?.data?.suffixStart === 'number') {
        return sourceText.slice(node.data.suffixStart)
    }
    return buildSuffixPreview(node, sourceText)
}

function ensureTooltip() {
    const tooltipId = 'subtree-tooltip'
    let tooltip = document.getElementById(tooltipId)
    if (!tooltip) {
        tooltip = document.createElement('div')
        tooltip.id = tooltipId
        tooltip.className = 'subtree-tooltip'
        document.body.appendChild(tooltip)
    }
    tooltip.style.display = 'none'
    return tooltip
}

function showTooltip(event, tooltip, content) {
    tooltip.textContent = content
    tooltip.style.display = 'block'
    tooltip.classList.add('is-visible')
    positionTooltip(event, tooltip)
}

function moveTooltip(event, tooltip) {
    if (!tooltip.classList.contains('is-visible')) {
        return
    }
    positionTooltip(event, tooltip)
}

function hideTooltip(tooltip) {
    tooltip.classList.remove('is-visible')
    tooltip.style.display = 'none'
}

function positionTooltip(event, tooltip) {
    const offset = 16
    const clientX = typeof event.clientX === 'number' ? event.clientX : event.pageX
    const clientY = typeof event.clientY === 'number' ? event.clientY : event.pageY
    let x = clientX + offset
    let y = clientY + offset
    const { width, height } = tooltip.getBoundingClientRect()
    const maxX = Math.max(0, window.innerWidth - width - offset)
    const maxY = Math.max(0, window.innerHeight - height - offset)
    x = Math.min(x, maxX)
    y = Math.min(y, maxY)
    tooltip.style.left = `${x}px`
    tooltip.style.top = `${y}px`
}

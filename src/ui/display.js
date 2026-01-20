import { toVisibleText } from '../suffix-prefix/uts.js'

const SUFFIX_TOOLTIP_PREVIEW = 256

export function displayFileInfo(element, files = []) {
    if (!element) {
        return
    }

    const fileList = Array.isArray(files) ? files : []
    if (fileList.length === 0) {
        element.innerHTML = ''
        element.style.display = 'none'
        return
    }

    const totalBytes = fileList.reduce((sum, file) => sum + (file?.size || 0), 0)
    const totalSizeKb = (totalBytes / 1024).toFixed(2)
    const previewCount = Math.min(5, fileList.length)
    const previewNames = fileList.slice(0, previewCount).map(file => file?.name || 'невідомо')
    const remaining = fileList.length - previewCount

    const namesHtml = previewNames.map(name => `<li>${name}</li>`).join('')
    const remainingHtml = remaining > 0 ? `<li>...та ще ${remaining}</li>` : ''

    element.innerHTML = `
        <strong>Файлів:</strong> ${fileList.length}<br>
        <strong>Загальний розмір:</strong> ${totalSizeKb} KB
        <ul class="file-info-list">
            ${namesHtml}${remainingHtml}
        </ul>
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
            <div class="stat-item">
                <div class="stat-label">Ліміт пам'яті</div>
                <div class="stat-value">${stats.memoryLimit ?? 'N/A'}</div>
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
        const groupTrees = Array.isArray(groupResult?.suffixSubtrees) ? groupResult.suffixSubtrees : []
        if (groupTrees.length === 0) {
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
        groupMeta.textContent = `Префіксів: ${groupTrees.length}`

        const canvasWrapper = document.createElement('div')
        canvasWrapper.className = 'subtree-group-canvas'

        groupWrapper.appendChild(groupTitle)
        groupWrapper.appendChild(groupMeta)
        groupWrapper.appendChild(canvasWrapper)
        targetContainer.appendChild(groupWrapper)

        const treeContexts = []
        const resetAllCanvases = () => {
            if (!treeContexts.length) {
                return
            }
            treeContexts.forEach(({ svg, zoomBehavior }) => {
                svg.transition().duration(200).call(zoomBehavior.transform, d3.zoomIdentity)
            })
        }

        if (groupTrees.length > 1) {
            const groupResetBtn = document.createElement('button')
            groupResetBtn.type = 'button'
            groupResetBtn.className = 'subtree-reset-btn group-wide'
            groupResetBtn.textContent = ''
            groupResetBtn.title = 'Скинути панорамування для всіх піддерев групи'
            groupResetBtn.setAttribute('aria-label', 'Скинути панорамування для всіх піддерев групи')
            groupResetBtn.addEventListener('click', resetAllCanvases)
            canvasWrapper.appendChild(groupResetBtn)
        }

        groupTrees.forEach((treeData, treeIndex) => {
            if (!treeData || !Array.isArray(treeData.nodes) || treeData.nodes.length === 0) {
                return
            }

            const treeToRender = {
                ...treeData,
                prefix: toVisibleText(treeData.prefix || ''),
                edges: Array.isArray(treeData.edges)
                    ? treeData.edges.map(edge => ({
                        ...edge,
                        labelPreview: toVisibleText(edge.labelPreview || '')
                    }))
                    : []
            }

            const treeWrapper = document.createElement('div')
            treeWrapper.className = 'subtree-canonical'

            const prefixLabel = document.createElement('div')
            prefixLabel.className = 'subtree-prefix-label'
            const prefixText = treeToRender.prefix ? `"${treeToRender.prefix}"` : '(порожній префікс)'
            prefixLabel.textContent = `Префікс: ${prefixText}`
            treeWrapper.appendChild(prefixLabel)

            const treeCanvasWrapper = document.createElement('div')
            treeCanvasWrapper.className = 'subtree-canonical-canvas'
            const canvas = document.createElement('div')
            canvas.className = 'subtree-group-canvas-inner'
            treeCanvasWrapper.appendChild(canvas)

            const hierarchyData = convertTreeToHierarchy(treeToRender)
            if (!hierarchyData) {
                canvas.innerHTML = '<div class="error">Не вдалося побудувати це піддерево</div>'
                treeWrapper.appendChild(treeCanvasWrapper)
                canvasWrapper.appendChild(treeWrapper)
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

            const context = { svg, zoomBehavior }
            treeContexts.push(context)

            if (groupTrees.length === 1) {
                const resetBtn = document.createElement('button')
                resetBtn.type = 'button'
                resetBtn.className = 'subtree-reset-btn'
                resetBtn.textContent = ''
                resetBtn.title = 'Скинути панорамування'
                resetBtn.setAttribute('aria-label', 'Скинути панорамування')
                resetBtn.addEventListener('click', () => {
                    svg.transition().duration(200).call(zoomBehavior.transform, d3.zoomIdentity)
                })
                treeCanvasWrapper.appendChild(resetBtn)
            }

            const treeLayout = d3.tree().size([innerWidth, innerHeight])
            treeLayout(hierarchyRoot)

            const linkGenerator = d3.linkVertical().x(d => d.x).y(d => d.y)
            const linkData = hierarchyRoot.links().map((link, linkIndex) => ({
                ...link,
                __id: `subtree-link-${groupResult?.groupId ?? index}-${treeIndex}-${linkIndex}`
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
                    const textValue = (link.target?.data?.edgeLabel || '').trim()
                    if (!textValue) {
                        return false
                    }
                    const dx = link.target.x - link.source.x
                    const dy = link.target.y - link.source.y
                    const segmentLength = Math.sqrt(dx * dx + dy * dy)
                    return segmentLength >= 45
                }).map(link => ({
                    ...link,
                    labelText: (link.target?.data?.edgeLabel || '').slice(0, 32)
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
                .attr('fill', colorScale((index + treeIndex) % 10))
                .attr('stroke', '#0f172a')
                .attr('stroke-width', 0.9)

            nodes.on('mouseenter', (event, d) => {
                showTooltip(event, tooltip, formatTooltip(d, groupResult, normalizedText, treeToRender))
            }).on('mousemove', (event) => {
                moveTooltip(event, tooltip)
            }).on('mouseleave', () => {
                hideTooltip(tooltip)
            })

            treeWrapper.appendChild(treeCanvasWrapper)
            canvasWrapper.appendChild(treeWrapper)
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

function formatTooltip(node, groupResult, sourceText, treeMeta) {
    if (node?.data?.type === 'leaf') {
        const { excerpt, hasMore } = buildSuffixExcerpt(node, sourceText, SUFFIX_TOOLTIP_PREVIEW)
        const stringName = node?.data?.stringName || 'невідомий файл'
        const localIndex = typeof node?.data?.localIndex === 'number' ? node.data.localIndex : null
        return {
            type: 'leaf',
            groupLabel: groupResult?.displayIndex ?? groupResult?.groupId ?? '?',
            prefix: treeMeta?.prefix || '',
            suffixPreview: excerpt || 'невідомо',
            hasMore,
            stringName,
            localIndex,
            getFullSuffix: () => getFullSuffix(node, sourceText)
        }
    }
    return `Вузол рівня ${node?.depth || 0}`
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

function buildSuffixExcerpt(node, sourceText, maxLength = SUFFIX_TOOLTIP_PREVIEW) {
    if (sourceText && typeof node?.data?.suffixStart === 'number') {
        const start = node.data.suffixStart
        const end = Math.min(sourceText.length, start + maxLength)
        const excerpt = sourceText.slice(start, end).trim()
        return {
            excerpt,
            hasMore: end < sourceText.length
        }
    }
    const preview = buildSuffixPreview(node, sourceText, maxLength)
    return { excerpt: preview.trim(), hasMore: false }
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
    tooltip.innerHTML = ''

    if (typeof content === 'string') {
        tooltip.textContent = content
    } else if (content && content.type === 'leaf') {
        const title = document.createElement('div')
        title.className = 'tooltip-title'
        title.textContent = `Група #${content.groupLabel}`
        tooltip.appendChild(title)

        if (content.prefix) {
            const prefixRow = document.createElement('div')
            prefixRow.className = 'tooltip-prefix'
            prefixRow.textContent = `Префікс: "${content.prefix}"`
            tooltip.appendChild(prefixRow)
        }

        const metaRow = document.createElement('div')
        metaRow.className = 'tooltip-meta'
        const indexText = typeof content.localIndex === 'number' ? `, індекс ${content.localIndex}` : ''
        metaRow.textContent = `Файл: ${content.stringName}${indexText}`
        tooltip.appendChild(metaRow)

        const previewRow = document.createElement('div')
        previewRow.className = 'tooltip-suffix-preview'
        previewRow.textContent = `Суфікс (перші ${SUFFIX_TOOLTIP_PREVIEW} симв.): ${content.suffixPreview}${content.hasMore ? '…' : ''}`
        tooltip.appendChild(previewRow)

        const copyBtn = document.createElement('button')
        copyBtn.type = 'button'
        copyBtn.className = 'tooltip-copy-button'
        copyBtn.textContent = content.hasMore ? 'Скопіювати повний суфікс' : 'Скопіювати суфікс'
        copyBtn.addEventListener('click', async (event) => {
            event.stopPropagation()
            const fullSuffix = typeof content.getFullSuffix === 'function'
                ? content.getFullSuffix()
                : content.suffixPreview
            if (!fullSuffix) {
                copyBtn.textContent = 'Немає даних'
                return
            }
            const success = await copyTextToClipboard(fullSuffix)
            copyBtn.textContent = success ? 'Скопійовано!' : 'Помилка копіювання'
            setTimeout(() => {
                copyBtn.textContent = content.hasMore ? 'Скопіювати повний суфікс' : 'Скопіювати суфікс'
            }, 2000)
        })
        tooltip.appendChild(copyBtn)
    } else {
        tooltip.textContent = ''
    }

    tooltip.style.display = 'block'
    tooltip.classList.add('is-visible')
    positionTooltip(event, tooltip)
}

async function copyTextToClipboard(text) {
    if (!text) {
        return false
    }
    if (navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch (error) {
            console.warn('Не вдалося скопіювати через clipboard API', error)
        }
    }

    try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        const success = document.execCommand('copy')
        document.body.removeChild(textarea)
        return success
    } catch (error) {
        console.warn('Fallback копіювання не вдалося', error)
        return false
    }
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

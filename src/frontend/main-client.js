import { DGSTApiClient } from './api-client.js'
import { displayFileInfo, displayStatus, displaySubTreeVisualization, displayStats } from '../ui/display.js'

const apiClient = new DGSTApiClient()

let currentFiles = []
let latestGroupPages = []
let currentGroupIndex = 0
let currentJobId = null

const fileInput = document.getElementById('file-input')
const numWorkersInput = document.getElementById('num-workers')
const buildBtn = document.getElementById('build-dgst-btn')
const buildStatus = document.getElementById('build-status')
const fileInfo = document.getElementById('file-info')
const subtreeCanvas = document.getElementById('subtrees-visualization')
const navPrevBtn = document.getElementById('subtree-prev')
const navNextBtn = document.getElementById('subtree-next')
const navCurrentInput = document.getElementById('subtree-current-index')
const navTotalLabel = document.getElementById('subtree-total-count')

const renderCurrentGroup = () => {
    if (!Array.isArray(latestGroupPages) || latestGroupPages.length === 0 || !subtreeCanvas) {
        subtreeCanvas.innerHTML = '<div class="loading">Піддерева ще не сформовані</div>'
        return
    }
    const safeIndex = Math.min(Math.max(currentGroupIndex, 0), Math.max(latestGroupPages.length - 1, 0))
    currentGroupIndex = safeIndex
    const selectedGroup = latestGroupPages[safeIndex]
    const displayGroup = {
        ...selectedGroup,
        displayIndex: safeIndex + 1
    }
    displaySubTreeVisualization([displayGroup], subtreeCanvas, null, null)

    if (navCurrentInput) {
        navCurrentInput.disabled = latestGroupPages.length === 0
        navCurrentInput.min = latestGroupPages.length ? 1 : 0
        navCurrentInput.max = Math.max(latestGroupPages.length, 1)
        navCurrentInput.value = latestGroupPages.length ? String(safeIndex + 1) : ''
    }
    if (navTotalLabel) {
        navTotalLabel.textContent = String(Math.max(latestGroupPages.length, 1))
    }
    if (navPrevBtn) {
        navPrevBtn.disabled = latestGroupPages.length <= 1 || safeIndex === 0
    }
    if (navNextBtn) {
        navNextBtn.disabled = latestGroupPages.length <= 1 || safeIndex >= latestGroupPages.length - 1
    }
}

const jumpToGroupIndex = (indexValue) => {
    if (!latestGroupPages || latestGroupPages.length === 0) {
        return
    }
    const maxIndex = latestGroupPages.length - 1
    const nextIndex = Math.min(Math.max(indexValue, 0), maxIndex)
    if (nextIndex === currentGroupIndex) {
        if (navCurrentInput) {
            navCurrentInput.value = String(nextIndex + 1)
        }
        return
    }
    currentGroupIndex = nextIndex
    loadAndRenderGroup(nextIndex)
}

const loadAndRenderGroup = async (groupIndex) => {
    if (!currentJobId || !latestGroupPages[groupIndex]) {
        return
    }

    try {
        displayStatus(buildStatus, 'loading', `Завантаження групи ${groupIndex + 1}...`)
        
        const groupData = await apiClient.getGroup(latestGroupPages[groupIndex].groupId, currentJobId)
        
        latestGroupPages[groupIndex] = groupData
        
        renderCurrentGroup()
        
        displayStatus(buildStatus, 'success', `Група ${groupIndex + 1} завантажена`)
    } catch (error) {
        console.error('[Frontend] Failed to load group:', error)
        displayStatus(buildStatus, 'error', `Помилка завантаження групи: ${error.message}`)
    }
}

const parseInputIndex = () => {
    if (!navCurrentInput) {
        return
    }
    const rawValue = parseInt(navCurrentInput.value, 10)
    if (Number.isNaN(rawValue)) {
        navCurrentInput.value = latestGroupPages && latestGroupPages.length ? String(currentGroupIndex + 1) : ''
        return
    }
    jumpToGroupIndex(rawValue - 1)
}

if (navPrevBtn) {
    navPrevBtn.addEventListener('click', () => {
        if (!latestGroupPages || latestGroupPages.length === 0 || currentGroupIndex === 0) {
            return
        }
        jumpToGroupIndex(currentGroupIndex - 1)
    })
}

if (navNextBtn) {
    navNextBtn.addEventListener('click', () => {
        if (!latestGroupPages || latestGroupPages.length === 0) {
            return
        }
        const maxIndex = latestGroupPages.length - 1
        if (currentGroupIndex >= maxIndex) {
            return
        }
        jumpToGroupIndex(currentGroupIndex + 1)
    })
}

if (navCurrentInput) {
    navCurrentInput.addEventListener('change', parseInputIndex)
    navCurrentInput.addEventListener('blur', parseInputIndex)
}

if (fileInput) {
    fileInput.addEventListener('change', async (event) => {
        const files = Array.from(event.target.files || [])
        if (files.length) {
            await handleFileSelect(files)
        }
    })
}

async function handleFileSelect(files) {
    currentFiles = Array.isArray(files)
        ? files.filter(file => !!file)
        : []

    console.info('[Frontend] handleFileSelect отримав файли', {
        count: currentFiles.length,
        names: currentFiles.map(f => f.name)
    })

    displayFileInfo(fileInfo, currentFiles)

    if (buildBtn) {
        buildBtn.disabled = currentFiles.length === 0
        console.info('[Frontend] Кнопка побудови', buildBtn.disabled ? 'деактивована' : 'активована')
    }

    latestGroupPages = []
    currentGroupIndex = 0
    currentJobId = null
    displayStats(null)
    if (subtreeCanvas) {
        subtreeCanvas.innerHTML = '<div class="loading">Очікуємо результати піддерев</div>'
    }
    if (navPrevBtn) navPrevBtn.disabled = true
    if (navNextBtn) navNextBtn.disabled = true
    if (navCurrentInput) {
        navCurrentInput.disabled = true
        navCurrentInput.value = ''
    }
    if (navTotalLabel) navTotalLabel.textContent = '1'
}

if (buildBtn) {
    buildBtn.addEventListener('click', async () => {
        if (currentFiles.length === 0) {
            displayStatus(buildStatus, 'error', 'Будь ласка, виберіть файли')
            return
        }

        buildBtn.disabled = true
        console.info('[Frontend] Побудова розпочата')

        try {
            displayStatus(buildStatus, 'loading', 'Відправка файлів на сервер...')
            
            const numWorkers = Math.max(1, parseInt(numWorkersInput?.value || '4', 10) || 4)
            const jobResult = await apiClient.createJob(currentFiles, {
                numWorkers
            })

            currentJobId = jobResult.jobId
            console.info('[Frontend] Job створено:', currentJobId)

            displayStatus(buildStatus, 'loading', 'Побудова DGST на сервері...')

            const finalStatus = await apiClient.pollUntilComplete(currentJobId, (status) => {
                if (status.status === 'running') {
                    displayStatus(buildStatus, 'loading', `Побудова DGST... (прогрес: ${status.progress}%)`)
                }
            })

            console.info('[Frontend] Job завершено:', finalStatus)

            displayStatus(buildStatus, 'loading', 'Завантаження результатів...')

            const summary = await apiClient.getSummary(currentJobId)
            const groupsData = await apiClient.getGroups(currentJobId)

            console.info('[Frontend] Summary:', summary)
            console.info('[Frontend] Groups:', groupsData)

            const dgstTree = {
                totalNodes: summary.stats.totalNodes,
                totalEdges: summary.stats.totalEdges,
                maxDepth: summary.stats.maxDepth,
                totalSuffixes: summary.stats.totalSuffixes,
                buildTime: summary.duration,
                memoryLimit: summary.stats.memoryLimit,
                sPrefixes: summary.stats.sPrefixes
            }

            displayStats(dgstTree)

            latestGroupPages = groupsData.groups.map(g => ({
                displayIndex: g.displayIndex,
                groupId: g.groupId,
                totalFrequency: g.totalFrequency,
                suffixSubtrees: []
            }))

            currentGroupIndex = 0
            
            if (latestGroupPages.length > 0) {
                await loadAndRenderGroup(0)
            }

            displayStatus(buildStatus, 'success', `DGST успішно побудовано за ${summary.duration.toFixed(2)} сек! (воркери: ${numWorkers})`)
            buildBtn.disabled = false
            console.info('[Frontend] Побудову завершено')
        } catch (error) {
            console.error('[Frontend] Помилка побудови:', error)
            displayStatus(buildStatus, 'error', `Помилка: ${error.message}`)
            buildBtn.disabled = false
        }
    })
}

console.info('[Frontend] API client initialized')

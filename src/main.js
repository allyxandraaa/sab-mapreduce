import { readFileAsArrayBuffer } from './utils/fileUtils.js'
import { displayFileInfo, displayStatus, displaySubTreeVisualization, displayStats } from './ui/display.js'
import { DGSTConfig } from './init/config.js'
import { divideIntoSplits } from './divide/splitter.js'
import { buildSubTrees } from './subtree/builder.js'
import { UTSManager, DEFAULT_TERMINAL } from './suffix-prefix/uts.js'
import { shuffleByKey } from './merge/shuffle.js'
import { FrequencyTrie } from './suffix-prefix/frequencyTrie.js'

let dgstTree = null
let currentFile = null
let sharedBuffer = null
let config = null
let utsManager = null
const textDecoder = new TextDecoder('utf-8')
let decodedText = ''

document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input')
    const fileUploadArea = document.getElementById('file-upload-area')
    const fileInfo = document.getElementById('file-info')
    const buildBtn = document.getElementById('build-dgst-btn')
    const buildStatus = document.getElementById('build-status')
    const numWorkersInput = document.getElementById('num-workers')
    const subtreeCanvas = document.getElementById('subtrees-visualization')
    const navPrevBtn = document.getElementById('subtree-prev')
    const navNextBtn = document.getElementById('subtree-next')
    const navCurrentLabel = document.getElementById('subtree-current-index')
    const navTotalLabel = document.getElementById('subtree-total-count')

    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault()
        fileUploadArea.classList.add('dragover')
    })

    fileUploadArea.addEventListener('dragleave', () => {
        fileUploadArea.classList.remove('dragover')
    })

    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault()
        fileUploadArea.classList.remove('dragover')
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files
            handleFileSelect(e.dataTransfer.files[0])
        }
    })

    fileInput.addEventListener('change', async function () {
        if (this.files[0]) {
            await handleFileSelect(this.files[0])
        }
    })

    let latestSubTreeResult = null
    let latestGroupPages = []
    let currentGroupIndex = 0

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
        displaySubTreeVisualization([displayGroup], subtreeCanvas, decodedText)

        if (navCurrentLabel) {
            navCurrentLabel.textContent = String(latestGroupPages.length ? safeIndex + 1 : 0)
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

    if (navPrevBtn) {
        navPrevBtn.addEventListener('click', () => {
            if (!latestGroupPages || latestGroupPages.length === 0 || currentGroupIndex === 0) {
                return
            }
            currentGroupIndex -= 1
            renderCurrentGroup()
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
            currentGroupIndex += 1
            renderCurrentGroup()
        })
    }

    buildBtn.addEventListener('click', async function () {
        if (!currentFile) {
            alert('Файл не вибрано')
            return
        }
        
        buildBtn.disabled = true
        console.info('[Build] Старт побудови, кнопка вимкнена')
        const startTime = performance.now()
        displayStatus(buildStatus, 'loading', 'Побудова DGST...')
        
        try {
            displayStatus(buildStatus, 'loading', 'Завантаження файлу...')
            const arrayBuffer = await readFileAsArrayBuffer(currentFile)
            const fileBytes = new Uint8Array(arrayBuffer)
            let rawText = textDecoder.decode(fileBytes)
            
            displayStatus(buildStatus, 'loading', 'Ініціалізація конфігурації...')
            const numWorkers = parseInt(numWorkersInput.value) || 4
            config = new DGSTConfig({ 
                windowSize: 1,
                numWorkers: numWorkers,
                useFrequencyTrie: true,
                useUTS: true
            })
            
            if (config.useUTS) {
                utsManager = new UTSManager()
                utsManager.initializeSingle(rawText)
                decodedText = utsManager.getMergedText()
                console.info('[UTS] Додано термінальний символ', {
                    originalLength: rawText.length,
                    processedLength: decodedText.length,
                    terminalSymbol: DEFAULT_TERMINAL
                })
            } else {
                decodedText = rawText
            }
            
            const processedBytes = new TextEncoder().encode(decodedText)
            sharedBuffer = new SharedArrayBuffer(processedBytes.byteLength)
            const view = new Uint8Array(sharedBuffer)
            view.set(processedBytes)
            
            await config.initialize(processedBytes.byteLength)
            
            initializeWorkerPool(config.numWorkers)
            
            displayStatus(buildStatus, 'loading', 'Розподіл на спліти...')
            const splits = divideIntoSplits(view, config)
            console.log(`Створено ${splits.length} сплітів`, splits)
            
            displayStatus(buildStatus, 'loading', `Обчислення S-префіксів (${splits.length} сплітів)...`)
            const allSPrefixes = await processIteratively(splits, config)
            console.info('[SPrefix] Отримано фінальний список S-префіксів', {
                totalPrefixes: allSPrefixes.length,
                totalFrequency: allSPrefixes.reduce((sum, sp) => sum + (sp?.frequency || 0), 0),
                prefixes: allSPrefixes
            })

            displayStatus(buildStatus, 'loading', 'Групування та побудова піддерев...')
            let subTreeResult = { groups: [], rounds: [], subTrees: [], suffixSubtrees: [] }
            try {
                subTreeResult = await buildSubTrees({
                    sharedBuffer,
                    sPrefixes: allSPrefixes,
                    config,
                    executeRound: runSubTreeRound
                })
            } catch (subTreeError) {
                console.error('Не вдалося побудувати піддерева:', subTreeError)
                displayStatus(buildStatus, 'error', `Помилка піддерева: ${subTreeError.message || subTreeError}`)
                buildBtn.disabled = false
                console.info('[Build] Завершено з помилкою, кнопка увімкнена')
                return
            }
            
            let fallbackTotalSuffixes = 0
            splits.forEach(split => {
                fallbackTotalSuffixes += split.length
            })

            const buildTime = (performance.now() - startTime) / 1000
            const suffixSubtrees = Array.isArray(subTreeResult.suffixSubtrees) ? subTreeResult.suffixSubtrees : []
            const aggregatedTreeStats = suffixSubtrees.reduce((acc, tree) => {
                if (!tree) {
                    return acc
                }
                const nodeCount = Array.isArray(tree?.nodes) ? tree.nodes.length : 0
                const edgeCount = Array.isArray(tree?.edges) ? tree.edges.length : 0
                const treeDepth = Array.isArray(tree?.nodes) && tree.nodes.length
                    ? tree.nodes.reduce((max, node) => Math.max(max, node?.depth ?? 0), 0)
                    : 0
                const suffixCount = typeof tree?.suffixCount === 'number' ? tree.suffixCount : 0

                acc.totalNodes += nodeCount
                acc.totalEdges += edgeCount
                acc.maxDepth = Math.max(acc.maxDepth, treeDepth)
                acc.totalSuffixes += suffixCount
                return acc
            }, { totalNodes: 0, totalEdges: 0, maxDepth: 0, totalSuffixes: 0 })

            const hasTreeStats = suffixSubtrees.length > 0
            const fallbackEdgeCount = allSPrefixes.reduce((sum, sp) => sum + (sp?.frequency || 0), 0)
            const fallbackMaxDepth = allSPrefixes.reduce((max, sp) => Math.max(max, sp?.length || 0), 0)

            const resolvedSuffixCount = hasTreeStats ? aggregatedTreeStats.totalSuffixes : fallbackTotalSuffixes

            dgstTree = {
                totalNodes: hasTreeStats ? aggregatedTreeStats.totalNodes : allSPrefixes.length,
                totalEdges: hasTreeStats ? aggregatedTreeStats.totalEdges : fallbackEdgeCount,
                maxDepth: hasTreeStats ? aggregatedTreeStats.maxDepth : fallbackMaxDepth,
                totalSuffixes: resolvedSuffixCount,
                buildTime: buildTime,
                memoryLimit: config?.memoryLimit ?? null,
                sPrefixes: allSPrefixes,
                splits: splits.length,
                subTrees: subTreeResult.subTrees,
                subTreeGroups: subTreeResult.groups.length,
                subTreeRounds: subTreeResult.rounds.length,
                suffixSubtrees
            }
            
            latestSubTreeResult = subTreeResult
            latestGroupPages = Array.isArray(subTreeResult.groups)
                ? subTreeResult.groups.map((group, idx) => {
                    const match = subTreeResult.subTrees.find(res => res?.groupId === group.id)
                    return {
                        displayIndex: idx + 1,
                        groupId: group.id,
                        totalFrequency: group.totalFrequency,
                        suffixSubtrees: Array.isArray(match?.suffixSubtrees) ? match.suffixSubtrees : []
                    }
                })
                : []
            displayStats(dgstTree)
            currentGroupIndex = 0
            renderCurrentGroup()

            displayStatus(buildStatus, 'success', `DGST успішно побудовано за ${buildTime.toFixed(2)} сек!`)
            buildBtn.disabled = false
            console.info('[Build] Побудову завершено, кнопка увімкнена')
        } catch (error) {
            console.error("Помилка при побудові DGST:", error)
            displayStatus(buildStatus, 'error', `Помилка: ${error.message}`)
            buildBtn.disabled = false
            console.info('[Build] Пост global catch, кнопка увімкнена через помилку')
        }
    })
    
    async function runReduceWorkers(partitions) {
        if (workerPool.length !== partitions.length) {
            initializeWorkerPool(partitions.length || 1)
        }

        const promises = []

        for (let i = 0; i < partitions.length; i++) {
            const partition = partitions[i]
            if (partition.length === 0) {
                promises.push(Promise.resolve({ sPrefixes: [] }))
                continue
            }

            const worker = workerPool[i]

            const promise = new Promise((resolve, reject) => {
                const handler = (event) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)

                    if (event.data.type === 'success') {
                        resolve(event.data.result)
                    } else if (event.data.type === 'error') {
                        reject(new Error(event.data.error))
                    }
                }

                const errorHandler = (error) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)
                    reject(error)
                }

                worker.addEventListener('message', handler)
                worker.addEventListener('error', errorHandler)

                worker.postMessage({
                    phase: 'reduce',
                    partition: partition,
                    partitionIndex: i
                })
            })

            promises.push(promise)
        }

        return Promise.all(promises)
    }

    async function runSubTreeRound(groups) {
        if (!Array.isArray(groups) || groups.length === 0) {
            return []
        }

        console.info('[SubTree] runSubTreeRound старт', {
            groupCount: groups.length,
            groupIds: groups.map(group => group?.id)
        })

        if (!sharedBuffer) {
            throw new Error('SharedArrayBuffer недоступний для побудови піддерев')
        }

        if (!config) {
            throw new Error('Конфігурація відсутня для побудови піддерев')
        }

        if (workerPool.length !== config.numWorkers) {
            initializeWorkerPool(config.numWorkers)
        }

        if (groups.length > workerPool.length) {
            throw new Error(`Груп у раунді (${groups.length}) більше, ніж воркерів (${workerPool.length})`)
        }

        const promises = groups.map((group, index) => {
            if (!group || group.prefixes.length === 0) {
                return Promise.resolve(null)
            }

            const worker = workerPool[index]

            console.debug('[SubTree] Надсилаємо групу воркеру', {
                workerIndex: index,
                groupId: group.id,
                prefixCount: group.prefixes.length
            })

            return new Promise((resolve, reject) => {
                const handler = (event) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)

                    if (event.data.type === 'success' && event.data.phase === 'subtree') {
                        console.debug('[SubTree] Отримано результат від воркера', {
                            workerIndex: index,
                            groupId: group.id,
                            suffixTreeCount: event.data.result?.treeCount
                        })
                        resolve(event.data.result)
                    } else if (event.data.type === 'error') {
                        console.error('[SubTree] Воркер повернув помилку', {
                            workerIndex: index,
                            groupId: group.id,
                            error: event.data.error
                        })
                        reject(new Error(event.data.error))
                    } else {
                        resolve(null)
                    }
                }

                const errorHandler = (error) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)
                    reject(error)
                }

                worker.addEventListener('message', handler)
                worker.addEventListener('error', errorHandler)

                worker.postMessage({
                    phase: 'subtree',
                    sharedBuffer,
                    group,
                    useFrequencyTrie: config.useFrequencyTrie
                })
            })
        })

        const roundResults = await Promise.all(promises)

        console.info('[SubTree] runSubTreeRound завершено', {
            resolvedResults: roundResults.filter(Boolean).length,
            emptyResults: roundResults.filter(res => !res).length
        })

        return roundResults
    }

    let workerPool = []
    
    function initializeWorkerPool(numWorkers) {
        workerPool.forEach(w => w.terminate())
        workerPool = []
        
        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker('src/divide/worker.js', { type: 'module' })
            workerPool.push(worker)
        }
    }

    async function runMapWorkers(splits, config, targetPrefixes = null) {
        if (workerPool.length !== config.numWorkers || splits.length !== config.numWorkers) {
            initializeWorkerPool(config.numWorkers)
        }

        if (splits.length !== workerPool.length) {
            throw new Error(`Кількість сплітів (${splits.length}) не відповідає кількості воркерів (${workerPool.length})`)
        }

        const promises = []

        for (let i = 0; i < splits.length; i++) {
            const split = splits[i]
            const worker = workerPool[i]

            const promise = new Promise((resolve, reject) => {
                const handler = (event) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)

                    if (event.data.type === 'success') {
                        resolve(event.data.result)
                    } else if (event.data.type === 'error') {
                        reject(new Error(event.data.error))
                    }
                }

                const errorHandler = (error) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)
                    reject(error)
                }

                worker.addEventListener('message', handler)
                worker.addEventListener('error', errorHandler)

                worker.postMessage({
                    phase: 'divide',
                    sharedBuffer: sharedBuffer,
                    split: split,
                    windowSize: config.windowSize,
                    memoryLimit: config.memoryLimit,
                    targetPrefixes: targetPrefixes ? Array.from(targetPrefixes) : null
                })
            })

            promises.push(promise)
        }

        const results = await Promise.all(promises)
        return results
    }

    async function processIteratively(splits, config) {
        let windowSize = config.windowSize
        const windowStepSize = config.windowStepSize || 1
        let targetPrefixes = null
        const finalPrefixes = []

        while (true) {
            config.windowSize = windowSize

            const updatedSplits = splits.map(split => {
                const tail = Math.max(windowSize - 1, config.tailLength || windowSize)
                return {
                    ...split,
                    tailedEnd: Math.min(split.end + tail, sharedBuffer.byteLength)
                }
            })

            const mapResults = await runMapWorkers(updatedSplits, config, targetPrefixes)
            const partitions = shuffleByKey(mapResults, config.numWorkers)
            const reduceResults = await runReduceWorkers(partitions)
            const mergedTrie = buildTrieFromReduceResults(reduceResults)

            const { accepted, needsExtension } = mergedTrie.partitionByFrequency(config.memoryLimit, windowSize)

            accepted.forEach(sp => {
                finalPrefixes.push({ prefix: sp.prefix, frequency: sp.frequency, length: windowSize })
            })

            if (needsExtension.length === 0) {
                break
            }

            targetPrefixes = new Set(needsExtension.map(p => p.prefix))
            windowSize += windowStepSize

            console.info('[SPrefix] Ітерація з Frequency Trie', {
                windowSize,
                acceptedCount: accepted.length,
                needsExtensionCount: needsExtension.length
            })

            if (windowSize > 100) {
                throw new Error('Досягнуто максимальний розмір вікна. Неможливо обробити всі префікси в межах memoryLimit.')
            }
        }

        return prunePrefixes(finalPrefixes)
    }

    function prunePrefixes(prefixes) {
        if (prefixes.length <= 1) return prefixes

        const sorted = [...prefixes].sort((a, b) => a.length - b.length)
        const result = []
        const covered = new Set()

        for (const prefix of sorted) {
            let isCovered = false
            for (const coveredPrefix of covered) {
                if (prefix.prefix.startsWith(coveredPrefix)) {
                    isCovered = true
                    break
                }
            }

            if (!isCovered) {
                result.push(prefix)
                covered.add(prefix.prefix)
            }
        }

        return result
    }

    function buildTrieFromReduceResults(reduceResults) {
        const trie = new FrequencyTrie()
        if (!Array.isArray(reduceResults)) {
            return trie
        }

        reduceResults.forEach(result => {
            const prefixes = result?.sPrefixes || []
            prefixes.forEach(sp => {
                if (!sp || !sp.prefix) return
                const freq = sp.frequency || 0
                if (freq <= 0) return
                trie.insert(sp.prefix, freq)
            })
        })

        return trie
    }

    async function handleFileSelect(file) {
        currentFile = file
        console.info('[Build] handleFileSelect отримав файл', { name: file.name, size: file.size })
        const fileSize = (file.size / 1024).toFixed(2)
        displayFileInfo(fileInfo, file.name, fileSize)
        
        buildBtn.disabled = false
        console.info('[Build] Кнопка побудови активована після вибору файлу')
        dgstTree = null
        sharedBuffer = null
        config = null
        utsManager = null
        decodedText = ''
        latestSubTreeResult = null
        latestGroupPages = []
        currentGroupIndex = 0
        displayStats(null)
        if (subtreeCanvas) {
            subtreeCanvas.innerHTML = '<div class="loading">Очікуємо результати піддерев</div>'
        }
        if (navPrevBtn) navPrevBtn.disabled = true
        if (navNextBtn) navNextBtn.disabled = true
        if (navCurrentLabel) navCurrentLabel.textContent = '0'
        if (navTotalLabel) navTotalLabel.textContent = '1'
        displayStatus(buildStatus, null, '')
    }
})

import { readFileAsArrayBuffer } from './utils/fileUtils.js'
import { displayFileInfo, displayStats, displaySearchResults, displayStatus, displaySuffixTree } from './ui/display.js'
import { DGSTConfig } from './init/config.js'
import { divideIntoSplits } from './divide/splitter.js'
import { buildSubTrees } from './subtree/builder.js'
import { buildGlobalSuffixTreeFromSubtrees } from './subtree/helpers.js'

const textDecoder = new TextDecoder('utf-8')

let dgstTree = null
let currentFile = null
let sharedBuffer = null
let config = null

document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input')
    const fileUploadArea = document.getElementById('file-upload-area')
    const fileInfo = document.getElementById('file-info')
    const buildBtn = document.getElementById('build-dgst-btn')
    const buildStatus = document.getElementById('build-status')
    const numWorkersInput = document.getElementById('num-workers')
    const searchInput = document.getElementById('search-input')
    const searchBtn = document.getElementById('search-btn')
    const searchResults = document.getElementById('search-results')

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

    buildBtn.addEventListener('click', async function () {
        if (!currentFile) {
            alert('Файл не вибрано')
            return
        }
        
        buildBtn.disabled = true
        const startTime = performance.now()
        displayStatus(buildStatus, 'loading', 'Побудова DGST...')
        
        try {
            displayStatus(buildStatus, 'loading', 'Завантаження файлу...')
            const arrayBuffer = await readFileAsArrayBuffer(currentFile)
            sharedBuffer = new SharedArrayBuffer(arrayBuffer.byteLength)
            const view = new Uint8Array(sharedBuffer)
            view.set(new Uint8Array(arrayBuffer))
            
            displayStatus(buildStatus, 'loading', 'Ініціалізація конфігурації...')
            const numWorkers = parseInt(numWorkersInput.value) || 4
            config = new DGSTConfig({ 
                windowSize: 2,
                numWorkers: numWorkers
            })
            await config.initialize(arrayBuffer.byteLength)
            
            initializeWorkerPool(config.numWorkers)
            
            displayStatus(buildStatus, 'loading', 'Розподіл на спліти...')
            const splits = divideIntoSplits(view, config)
            console.log(`Створено ${splits.length} сплітів`, splits)
            
            displayStatus(buildStatus, 'loading', `Обчислення S-префіксів (${splits.length} сплітів)...`)
            const allSPrefixes = await processIteratively(splits, config)

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
                return
            }
            
            let fallbackTotalSuffixes = 0
            splits.forEach(split => {
                fallbackTotalSuffixes += split.length
            })

            const buildTime = (performance.now() - startTime) / 1000
            
            let globalSuffixTree = null
            const suffixSubtrees = Array.isArray(subTreeResult.suffixSubtrees) ? subTreeResult.suffixSubtrees : []

            if (suffixSubtrees.length > 0) {
                displayStatus(buildStatus, 'loading', 'Побудова глобального суфіксного дерева...')
                try {
                    const sharedView = new Uint8Array(sharedBuffer)
                    const copied = new Uint8Array(sharedView.length)
                    copied.set(sharedView)
                    const fullText = textDecoder.decode(copied)
                    globalSuffixTree = buildGlobalSuffixTreeFromSubtrees(fullText, suffixSubtrees)
                } catch (globalTreeError) {
                    console.error('Не вдалося побудувати глобальне суфіксне дерево:', globalTreeError)
                    displayStatus(buildStatus, 'error', `Помилка глобального дерева: ${globalTreeError.message || globalTreeError}`)
                    buildBtn.disabled = false
                    return
                }
            }

            const resolvedSuffixCount = globalSuffixTree?.suffixCount || fallbackTotalSuffixes
            const globalSuffixes = globalSuffixTree?.suffixes || []

            dgstTree = {
                totalNodes: allSPrefixes.length,
                totalEdges: allSPrefixes.reduce((sum, sp) => sum + sp.frequency, 0),
                maxDepth: Math.max(...allSPrefixes.map(sp => sp.length), 0),
                totalSuffixes: resolvedSuffixCount,
                buildTime: buildTime,
                sPrefixes: allSPrefixes,
                splits: splits.length,
                subTrees: subTreeResult.subTrees,
                subTreeGroups: subTreeResult.groups.length,
                subTreeRounds: subTreeResult.rounds.length,
                globalTree: globalSuffixTree,
                globalSuffixes
            }
            
            displayStatus(buildStatus, 'success', `DGST успішно побудовано за ${buildTime.toFixed(2)} сек!`)
            displaySuffixTree(document.getElementById('stats-container'), globalSuffixTree)
            
            searchInput.disabled = false
            searchBtn.disabled = false
            buildBtn.disabled = false
        } catch (error) {
            console.error("Помилка при побудові DGST:", error)
            displayStatus(buildStatus, 'error', `Помилка: ${error.message}`)
            buildBtn.disabled = false
        }
    })
    
    async function runReduceWorkers(partitions) {
        if (workerPool.length === 0) {
            initializeWorkerPool(partitions.length)
        }
        
        const promises = []
        
        for (let i = 0; i < partitions.length; i++) {
            const partition = partitions[i]
            if (partition.length === 0) {
                promises.push(Promise.resolve({ sPrefixes: [] }))
                continue
            }
            
            const worker = workerPool[i % workerPool.length]
            
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
        
        const results = await Promise.all(promises)
        return results
    }
    
    async function runSubTreeRound(groups) {
        if (!Array.isArray(groups) || groups.length === 0) {
            return []
        }

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

            return new Promise((resolve, reject) => {
                const handler = (event) => {
                    worker.removeEventListener('message', handler)
                    worker.removeEventListener('error', errorHandler)

                    if (event.data.type === 'success' && event.data.phase === 'subtree') {
                        resolve(event.data.result)
                    } else if (event.data.type === 'error') {
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
                    group
                })
            })
        })

        return Promise.all(promises)
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
        let targetPrefixes = null 
        let finalPrefixes = []
    
        while (true) {
            config.windowSize = windowSize
    
            // 1. Оновлюємо хвости для нового вікна
            const updatedSplits = splits.map(split => {
                const tail = windowSize - 1
                return {
                    ...split,
                    tailedEnd: Math.min(split.end + tail, sharedBuffer.byteLength)
                }
            })
    
    
             // 2. Запускаємо воркерів
             // ВАЖЛИВО: Воркери мають знати, що якщо targetPrefixes != null,
             // то вони ігнорують все, що не починається з цих префіксів.
             const mapResults = await runMapWorkers(updatedSplits, config, targetPrefixes)
            
            const { shuffleByKey, mergeReduceResults } = await import('./merge/shuffle.js')
            
            const shuffledPartitions = shuffleByKey(mapResults, config.numWorkers)
            const reduceResults = await runReduceWorkers(shuffledPartitions)
            const aggregated = mergeReduceResults(reduceResults)
    
            const globalMap = new Map()
            aggregated.forEach(sp => {
                globalMap.set(sp.prefix, sp.frequency)
            })
    
            const nextRoundTargets = new Set()
            let hasProblematic = false
            let validCount = 0
            let problematicCount = 0
    
            // 3. Сортуємо: Валідні -> у результат, Проблемні -> на наступне коло
            for (const [prefix, count] of globalMap.entries()) {
                if (count > config.memoryLimit) {
                    // Це "товстий" префікс. Ми його НЕ додаємо у фінальний список.
                    // Ми його уточнюватимемо в наступному раунді.
                    nextRoundTargets.add(prefix)
                    hasProblematic = true
                    problematicCount++
                } else {
                    // Це "нормальний" префікс. Він готовий.
                    // Записуємо і забуваємо про нього.
                    finalPrefixes.push({ prefix, frequency: count, length: windowSize })
                    validCount++
                }
            }
    
    
            // 4. Логіка переходу
            if (!hasProblematic) {
                break
            }
            targetPrefixes = nextRoundTargets
            windowSize++ 
    
            // Hard Stop (запобіжник)
            if (windowSize > 100) {
                throw new Error('Досягнуто максимальний розмір вікна. Неможливо обробити всі префікси в межах memoryLimit.')
            }
        }
    
        return finalPrefixes
    }

    searchBtn.addEventListener('click', handleSearch)
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    })

    async function handleFileSelect(file) {
        currentFile = file
        const fileSize = (file.size / 1024).toFixed(2)
        displayFileInfo(fileInfo, file.name, fileSize)
        
        buildBtn.disabled = false
        dgstTree = null
        sharedBuffer = null
        config = null
        
        searchInput.disabled = true
        searchBtn.disabled = true
        searchResults.style.display = 'none'
        displayStats(null)
        displayStatus(buildStatus, null, '')
    }

    function handleSearch() {
        const query = searchInput.value.trim()
        if (!query || !dgstTree) return

        const mockResults = [
            { position: 42, context: '...текст навколо знайденого слова...' },
            { position: 156, context: '...інший контекст зі словом...' },
            { position: 289, context: '...ще один приклад використання...' }
        ]
        
        displaySearchResults(searchResults, query, mockResults)
    }
})


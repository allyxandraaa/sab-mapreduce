import { readFileAsArrayBuffer } from './utils/fileUtils.js'
import { displayFileInfo, displayStats, displaySearchResults, displayStatus, displaySuffixTree } from './ui/display.js'
import { DGSTConfig } from './init/config.js'
import { divideIntoSplits } from './divide/splitter.js'
import { buildSubTrees } from './subtree/builder.js'
import { searchInSuffixTree } from './search/searchTree.js'

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
        console.info('[Build] Старт побудови, кнопка вимкнена')
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
                windowSize: 1,
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
                console.info('[Build] Завершено з помилкою, кнопка увімкнена')
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
                    console.time('[GlobalTree] worker-build')
                    globalSuffixTree = await buildGlobalTreeInWorker(sharedBuffer, suffixSubtrees, (progressEvent) => {
                        if (!progressEvent || progressEvent.phase !== 'global-tree') {
                            return
                        }

                        const stageLabel = {
                            start: 'Підготовка даних для глобального дерева...',
                            decoded: 'Декодування тексту завершено, створюємо масив суфіксів...',
                            'build-complete': 'Фіналізуємо глобальне дерево...'
                        }[progressEvent.stage]

                        if (stageLabel) {
                            displayStatus(buildStatus, 'loading', stageLabel)
                        }

                        console.info('[GlobalTree][Worker]', progressEvent.stage, progressEvent.meta || {})
                    })
                    console.timeEnd('[GlobalTree] worker-build')
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
            console.time('[GlobalTree] render-display')
            displaySuffixTree(document.getElementById('stats-container'), globalSuffixTree)
            console.timeEnd('[GlobalTree] render-display')
            
            searchInput.disabled = false
            searchBtn.disabled = false
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
                    group
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

    async function buildGlobalTreeInWorker(sharedBuffer, suffixSubtrees, onProgress) {
        if (!sharedBuffer) {
            throw new Error('SharedArrayBuffer недоступний для глобального дерева')
        }

        if (!Array.isArray(suffixSubtrees) || suffixSubtrees.length === 0) {
            return null
        }

        return new Promise((resolve, reject) => {
            const worker = new Worker('src/divide/worker.js', { type: 'module' })

            const cleanup = () => {
                worker.removeEventListener('message', messageHandler)
                worker.removeEventListener('error', errorHandler)
                worker.terminate()
            }

            const messageHandler = (event) => {
                const data = event.data
                if (!data) {
                    return
                }

                if (data.type === 'progress' && data.phase === 'global-tree') {
                    onProgress?.(data)
                    return
                }

                if (data.type === 'success' && data.phase === 'global-tree') {
                    cleanup()
                    resolve(data.result)
                } else if (data.type === 'error') {
                    cleanup()
                    reject(new Error(data.error))
                }
            }

            const errorHandler = (error) => {
                cleanup()
                reject(error)
            }

            worker.addEventListener('message', messageHandler)
            worker.addEventListener('error', errorHandler)

            worker.postMessage({
                phase: 'global-tree',
                sharedBuffer,
                suffixSubtrees
            })
        })
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
        const finalPrefixes = []

        while (true) {
            config.windowSize = windowSize

            const updatedSplits = splits.map(split => {
                const tail = windowSize - 1
                return {
                    ...split,
                    tailedEnd: Math.min(split.end + tail, sharedBuffer.byteLength)
                }
            })

            const mapResults = await runMapWorkers(updatedSplits, config, targetPrefixes)
            const { shuffleByKey, mergeReduceResults } = await import('./merge/shuffle.js')
            const shuffledPartitions = shuffleByKey(mapResults, config.numWorkers)
            const reduceResults = await runReduceWorkers(shuffledPartitions)
            const aggregated = mergeReduceResults(reduceResults)

            const nextRoundTargets = new Set()
            let hasProblematic = false

            aggregated.forEach(sp => {
                if (sp.frequency > config.memoryLimit) {
                    nextRoundTargets.add(sp.prefix)
                    hasProblematic = true
                } else {
                    finalPrefixes.push({ prefix: sp.prefix, frequency: sp.frequency, length: windowSize })
                }
            })

            if (!hasProblematic) {
                break
            }

            targetPrefixes = nextRoundTargets
            windowSize++

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
        console.info('[Build] handleFileSelect отримав файл', { name: file.name, size: file.size })
        const fileSize = (file.size / 1024).toFixed(2)
        displayFileInfo(fileInfo, file.name, fileSize)
        
        buildBtn.disabled = false
        console.info('[Build] Кнопка побудови активована після вибору файлу')
        dgstTree = null
        sharedBuffer = null
        config = null
        
        searchInput.disabled = true
        searchBtn.disabled = true
    }

    async function handleSearch() {
        if (!dgstTree) {
            alert('DGST не побудовано')
            return
        }

        const query = searchInput.value
        const searchResultsContainer = document.getElementById('search-results')
        searchResultsContainer.innerHTML = ''

        const searchResult = await searchInSuffixTree(dgstTree.globalTree, query)
        if (searchResult) {
            displaySearchResults(searchResultsContainer, searchResult)
        } else {
            searchResultsContainer.innerHTML = 'Результата не знайдено'
        }
    }
})

import { readFileAsArrayBuffer } from './utils/fileUtils.js'
import { displayFileInfo, displayStats, displaySearchResults, displayStatus, displayPrefixes } from './ui/display.js'
import { DGSTConfig } from './init/config.js'
import { divideIntoSplits } from './divide/splitter.js'

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

    fileUploadArea.addEventListener('click', () => fileInput.click())
    
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
            
            displayStatus(buildStatus, 'loading', 'Розподіл на спліти...')
            const splits = divideIntoSplits(view, config)
            console.log(`Створено ${splits.length} сплітів`, splits)
            
            displayStatus(buildStatus, 'loading', `Обчислення S-префіксів (${splits.length} сплітів)...`)
            const allSPrefixes = await processIteratively(splits, config)
            
            let totalSuffixes = 0
            splits.forEach(split => {
                totalSuffixes += split.length
            })
            
            const buildTime = (performance.now() - startTime) / 1000
            
            dgstTree = {
                totalNodes: allSPrefixes.length,
                totalEdges: allSPrefixes.reduce((sum, sp) => sum + sp.frequency, 0),
                maxDepth: Math.max(...allSPrefixes.map(sp => sp.length), 0),
                totalSuffixes: totalSuffixes,
                buildTime: buildTime,
                sPrefixes: allSPrefixes,
                splits: splits.length
            }
            
            displayStatus(buildStatus, 'success', `DGST успішно побудовано за ${buildTime.toFixed(2)} сек!`)
            displayPrefixes(document.getElementById('stats-container'), allSPrefixes)
            
            searchInput.disabled = false
            searchBtn.disabled = false
        } catch (error) {
            console.error("Помилка при побудові DGST:", error)
            displayStatus(buildStatus, 'error', `Помилка: ${error.message}`)
            buildBtn.disabled = false
        }
    })
    
    async function runWorkers(splits, config, targetPrefixes = null) {
        const workers = []
        const promises = []
        
        for (let i = 0; i < splits.length; i++) {
            const split = splits[i]
            const promise = new Promise((resolve, reject) => {
                const worker = new Worker('src/divide/worker.js', { type: 'module' })
                
                worker.onmessage = (event) => {
                    if (event.data.type === 'success') {
                        resolve(event.data.result)
                        worker.terminate()
                    } else if (event.data.type === 'error') {
                        reject(new Error(event.data.error))
                        worker.terminate()
                    }
                }
                
                worker.onerror = (error) => {
                    reject(error)
                    worker.terminate()
                }
                
                worker.postMessage({
                    phase: 'divide',
                    sharedBuffer: sharedBuffer,
                    split: split,
                    windowSize: config.windowSize,
                    memoryLimit: config.memoryLimit,
                    targetPrefixes: targetPrefixes ? Array.from(targetPrefixes) : null
                })
                
                workers.push(worker)
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
    
            console.log(`Ітерація: windowSize=${windowSize}, шукаємо: ${targetPrefixes ? targetPrefixes.size + ' префіксів' : 'ВСІ'}, Fm=${config.memoryLimit}`)
    
             // 2. Запускаємо воркерів
             // ВАЖЛИВО: Воркери мають знати, що якщо targetPrefixes != null,
             // то вони ігнорують все, що не починається з цих префіксів.
             const results = await runWorkers(updatedSplits, config, targetPrefixes)
            
            const { aggregateSPrefixes } = await import('./merge/shuffle.js')
            const aggregated = aggregateSPrefixes(results)
    
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
    
            console.log(`Результат ітерації: Валідних (+${validCount}), Проблемних (${problematicCount})`)
    
            // 4. Логіка переходу
            if (!hasProblematic) {
                // УСПІХ: Немає жодного префікса, що перевищує ліміт.
                // Всі дані розбиті на шматки <= memoryLimit.
                console.log(`Всі префікси успішно розбиті. Завершення.`)
                break; 
            }
    
            // Якщо є проблемні -> продовжуємо ТІЛЬКИ з ними
            console.log(`Залишилось ${nextRoundTargets.size} великих префіксів. Поглиблюємо пошук...`)
            
            // Встановлюємо фільтр для наступного проходу
            targetPrefixes = nextRoundTargets
            
            // Збільшуємо вікно (можна агресивніше, наприклад +2)
            windowSize++ 
    
            // Hard Stop (запобіжник)
            if (windowSize > 100) {
                console.warn('Досягнуто максимальний розмір вікна! Примусово зберігаю великі префікси.')
                // Додаємо ті, що залишилися, навіть якщо вони великі
                for (const prefix of nextRoundTargets) {
                     // Увага: frequency треба брати з globalMap, але він вже міг загубитися
                     // Краще брати з попереднього кроку, або змиритися.
                     // У вашому коді вище ви ітерували globalMap, тут можна так само:
                }
                 for (const [prefix, count] of globalMap.entries()) {
                    if (count > config.memoryLimit) {
                         finalPrefixes.push({ prefix, frequency: count, length: windowSize })
                    }
                }
                break;
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


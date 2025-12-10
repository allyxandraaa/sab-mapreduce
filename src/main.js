import { readFileAsArrayBuffer } from './fileUtils.js'
import { displayFileInfo, displayStats, displaySearchResults, displayStatus } from './ui.js'
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
            const splits = divideIntoSplits(view, sharedBuffer, config)
            console.log(`Створено ${splits.length} сплітів`, splits)
            
            displayStatus(buildStatus, 'loading', `Обчислення S-префіксів (${splits.length} сплітів)...`)
            const sPrefixesResults = await computeSPrefixes(splits, config)
            
            const allSPrefixes = []
            let totalSuffixes = 0
            sPrefixesResults.forEach(result => {
                allSPrefixes.push(...result.sPrefixes)
                totalSuffixes += result.splitInfo.length
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
            displayStats(dgstTree)
            
            searchInput.disabled = false
            searchBtn.disabled = false
        } catch (error) {
            console.error("Помилка при побудові DGST:", error)
            displayStatus(buildStatus, 'error', `Помилка: ${error.message}`)
            buildBtn.disabled = false
        }
    })
    
    async function computeSPrefixes(splits, config) {
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
                    memoryLimit: config.memoryLimit
                })
                
                workers.push(worker)
            })
            
            promises.push(promise)
        }
        
        const results = await Promise.all(promises)
        return results
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


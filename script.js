// Функція для форматування тексту в стилізованому блоці
function displayFormattedText(text, element) {
    const wrapper = document.createElement('div')
    wrapper.className = 'code-preview'
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = text
    pre.appendChild(code)
    wrapper.appendChild(pre)
    element.innerHTML = ''
    element.appendChild(wrapper)
}

// Функція для відображення коду з файлу
async function displayCodeFile(file, previewElement) {
    if (!file) return

    try {
        const content = await readFilesAsText(file)
        displayFormattedText(content, previewElement)
    } catch (error) {
        previewElement.textContent = `Error loading file: ${error.message}`
    }
}

// Перегляд функцій при виборі файлу та автоматичне читання вмісту файлу
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input')
    const mapFileInput = document.getElementById('map-function-file')
    const reduceFileInput = document.getElementById('reduce-function-file')
    const mapPreview = document.getElementById('map-function-preview')
    const reducePreview = document.getElementById('reduce-function-preview')
    const fileContent = document.getElementById('file-content')

    fileInput.addEventListener('change', async function () {
        if (this.files[0]) {
            try {
                const text = await readFilesAsText(this.files[0])
                displayFormattedText(text, fileContent)
            } catch (error) {
                console.error("Помилка при читанні:", error)
                displayFormattedText(`Error: ${error.message}`, fileContent)
            }
        }
    })

    mapFileInput.addEventListener('change', function () {
        displayCodeFile(this.files[0], mapPreview)
    })

    reduceFileInput.addEventListener('change', function () {
        displayCodeFile(this.files[0], reducePreview)
    })
})

function getFile() {
    const fileInput = document.getElementById('file-input')
    return fileInput.files[0]
}

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(file)
    })
}

// допомжіна функція для читання файлу як текст
async function readFilesAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
    })
}

async function initializeMapReduce() {
    const file = getFile()
    if (!file) {
        alert('Please select a file')
        return
    }

    const mapFunctionFile = document.getElementById('map-function-file').files[0]
    const reduceFunctionFile = document.getElementById('reduce-function-file').files[0]

    if (!mapFunctionFile || !reduceFunctionFile) {
        alert('Please provide both map and reduce function files')
        return
    }

    let mapFunctionString, reduceFunctionString
    try {
        mapFunctionString = await readFilesAsText(mapFunctionFile)
        reduceFunctionString = await readFilesAsText(reduceFunctionFile)
    } catch (error) {
        alert(`Error reading function files: ${error.message}`)
        return
    }

    const arrayBuffer = await readFileAsArrayBuffer(file)
    const bufferLength = arrayBuffer.byteLength
    const sharedBuffer = new SharedArrayBuffer(bufferLength)
    const sharedView = new Uint8Array(sharedBuffer)
    sharedView.set(new Uint8Array(arrayBuffer))

    const numWorkers = parseInt(document.getElementById('num-workers').value) || 4

    console.log(`Starting processing ${bufferLength} bytes with ${numWorkers} workers...`)

    try {
        // 1. Map phase - воркери обробляють файл
        const mapWorkersWithResults = await runMapPhase(sharedBuffer, bufferLength, numWorkers, mapFunctionString)
        console.log("Map phase finished. Results:", mapWorkersWithResults.map(w => w.result))

        // 2. Shuffle and Sort phase - сортування та групування за ключами
        const shuffledData = await runShuffleAndSortPhase(mapWorkersWithResults, numWorkers)
        console.log("Shuffle and Sort phase finished. Results:", shuffledData)

        // 3. Reduce phase - перевикористовуємо тих самих воркерів
        const reduceResults = await runReducePhase(mapWorkersWithResults, reduceFunctionString, shuffledData)
        console.log("Reduce phase finished. Results:", reduceResults)

        // 4. Фінальне об'єднання результатів від всіх воркерів
        const finalResult = reduceResults.reduce((acc, curr) => {
            // Об'єднуємо об'єкти від різних воркерів
            return { ...acc, ...curr }
        }, {})

        console.log("Final Result:", finalResult)

        // 5. Термінуємо всіх воркерів
        mapWorkersWithResults.forEach(({ worker }) => worker.terminate())

        const resultElement = document.getElementById('result-output')
        if (resultElement) {
            displayFormattedText(JSON.stringify(finalResult, null, 2), resultElement)
        } else {
            const result = document.getElementById('result')
            if (result) {
                displayFormattedText(JSON.stringify(finalResult, null, 2), result)
            }
        }

    } catch (error) {
        console.error("MapReduce failed:", error)
        alert(`Error: ${error.message}`)
    }
}   

function spawnMapWorker(sharedBuffer, start, length, mapFunctionString) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('worker.js')

        // Обробка результатів від воркера
        worker.onmessage = function (event) {
            if (event.data.type === 'success' && event.data.phase === 'map') {
                resolve({
                    worker: worker,
                    result: event.data.result
                })
            } else if (event.data.type === 'error') {
                reject(new Error(event.data.error))
                worker.terminate()
            }
        }

        worker.onerror = function (err) {
            reject(new Error(`Worker error: ${err.message}`))
            worker.terminate()
        }

        // Відправляємо SharedArrayBuffer та параметри
        worker.postMessage({
            phase: 'map',
            sharedBuffer: sharedBuffer,
            start: start,
            length: length,
            mapFunction: mapFunctionString
        })
    })
}

function runMapPhase(sharedBuffer, bufferLength, numWorkers, mapFunctionString) {
    const chunkSize = Math.ceil(bufferLength / numWorkers)
    const mapWorkers = []

    for (let i = 0; i < numWorkers; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, bufferLength)
        const length = end - start

        mapWorkers.push(spawnMapWorker(sharedBuffer, start, length, mapFunctionString))
    }

    return Promise.all(mapWorkers)
}

// Shuffle and Sort phase: збирає, сортує, групує та розподіляє дані
async function runShuffleAndSortPhase(mapWorkersWithResults, numWorkers) {
    // 1. Збираємо всі пари [key, value] від всіх Map-воркерів
    const allPairs = []
    
    mapWorkersWithResults.forEach(({ result }) => {
        if (!Array.isArray(result)) {
            return
        }
        
        // Рекурсивна функція для збору всіх пар [key, value]
        const collectPairs = (arr) => {
            arr.forEach(item => {
                if (Array.isArray(item)) {
                    if (item.length === 2 && !Array.isArray(item[0]) && !Array.isArray(item[1])) {
                        // Це пара [key, value] - додаємо
                        allPairs.push(item)
                    } else {
                        // Це вкладений масив - рекурсивно обробляємо
                        collectPairs(item)
                    }
                } else if (typeof item === 'object' && item !== null) {
                    // Це об'єкт {key: value} - конвертуємо в пари
                    Object.entries(item).forEach(([key, value]) => {
                        if (typeof value === 'number' && value > 0) {
                            // Створюємо value пар [key, 1] для кожного входження
                            for (let i = 0; i < value; i++) {
                                allPairs.push([key, 1])
                            }
                        } else {
                            allPairs.push([key, value])
                        }
                    })
                }
            })
        }
        
        collectPairs(result)
    })

    if (allPairs.length === 0) {
        return Array(numWorkers).fill(null).map(() => ({}))
    }

    // 2. Сортуємо за ключами
    allPairs.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

    // 3. Групуємо значення за ключами
    const grouped = {}
    allPairs.forEach(([key, value]) => {
        const keyStr = String(key)
        if (!grouped[keyStr]) grouped[keyStr] = []
        grouped[keyStr].push(value)
    })

    // 4. Розподіляємо між воркерами (простий хеш)
    const distributed = Array(numWorkers).fill(null).map(() => ({}))
    Object.entries(grouped).forEach(([key, values]) => {
        const hash = String(key).split('').reduce((h, c) => h + c.charCodeAt(0), 0)
        distributed[hash % numWorkers][key] = values
    })

    return distributed
}

function runReducePhase(workersWithResults, reduceFunctionString, shuffledData) {
    return Promise.all(
        workersWithResults.map(({ worker }, i) => {
            return new Promise((resolve, reject) => {
                const data = Object.entries(shuffledData[i] || {})

                worker.onmessage = (e) => {
                    if (e.data.type === 'success' && e.data.phase === 'reduce') {
                        resolve(e.data.result)
                    } else if (e.data.type === 'error') {
                        reject(new Error(e.data.error))
                    }
                }

                worker.onerror = (err) => reject(new Error(`Worker error: ${err.message}`))

                worker.postMessage({
                    phase: 'reduce',
                    reduceFunction: reduceFunctionString,
                    data: data
                })
            })
        })
    )
}
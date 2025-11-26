async function readValue() {
    const file = getFile()
    if (!file) {
        alert('Please select a file')
        return
    }
    try {
        const text = await readFilesAsText(file)
        document.getElementById('file-content').innerText = text
    } catch (error) {
        console.error("Помилка при читанні:", error)
    }
}

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

    const mapFunctionString = document.getElementById('map-function').value
    const reduceFunctionString = document.getElementById('reduce-function').value
    
    if (!mapFunctionString || !reduceFunctionString) {
        alert('Please provide both map and reduce functions')
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
        const mapResults = await runMapReduce(sharedBuffer, bufferLength, numWorkers, mapFunctionString)
        
        console.log("Map phase finished. Results:", mapResults)

        // 2. Запуск Reduce фази
        // Спочатку об'єднуємо всі масиви від воркерів в один плоский масив
        // І виконуємо reduce
        const flatResults = mapResults.flat()
        const reduceFunction = new Function('acc', 'curr', reduceFunctionString)
        const finalResult = flatResults.reduce((acc, curr) => reduceFunction(acc, curr), {})
        
        console.log("Final Result:", finalResult)
        
        const resultElement = document.getElementById('result-output')
        if (resultElement) {
            resultElement.innerText = JSON.stringify(finalResult, null, 2)
        } else {
            document.getElementById('result').innerText = JSON.stringify(finalResult, null, 2)
        }

    } catch (error) {
        console.error("MapReduce failed:", error)
        alert(`Error: ${error.message}`)
    }
}

function runMapReduce(sharedBuffer, bufferLength, numWorkers, mapFunctionString) {
    const chunkSize = Math.ceil(bufferLength / numWorkers)
    const workers = []

    for (let i = 0; i < numWorkers; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, bufferLength)
        const length = end - start
        
        // Створюємо worker для обробки частини SharedArrayBuffer
        workers.push(spawnWorker(sharedBuffer, start, length, mapFunctionString))
    }

    return Promise.all(workers)
}

function spawnWorker(sharedBuffer, start, length, mapFunctionString) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('worker.js')

        worker.onmessage = function(event) {
            if (event.data.type === 'success') {
                resolve(event.data.result)
                worker.terminate()
            } else if (event.data.type === 'error') {
                reject(new Error(event.data.error))
                worker.terminate()
            }
        }

        worker.onerror = function(err) {
            reject(new Error(`Worker error: ${err.message}`))
            worker.terminate()
        }

        // Відправляємо SharedArrayBuffer та параметри
        worker.postMessage({
            sharedBuffer: sharedBuffer,
            start: start,
            length: length,
            mapFunction: mapFunctionString
        })
    })
}
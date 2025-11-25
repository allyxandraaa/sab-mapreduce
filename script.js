
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

    const arrayBuffer = await readFileAsArrayBuffer(file)
    const bufferLength = arrayBuffer.byteLength
    const sharedBuffer = new SharedArrayBuffer(bufferLength)
    const sharedView = new Uint8Array(sharedBuffer)
    sharedView.set(new Uint8Array(arrayBuffer))

    const numWorkers = parseInt(document.getElementById('num-workers').value) || 4
    const mapFunctionString = document.getElementById('map-function').value
    const reduceFunctionString = document.getElementById('reduce-function').value

    console.log(`Starting processing ${file.size} bytes with ${numWorkers} workers...`)

    // 3. Запускаємо MapReduce
    runMapReduce(sharedBuffer, file.size, numWorkers, mapFunctionString, reduceFunctionString)

    console.log(`Starting MapReduce with ${numWorkers} workers...`)

    try {
        // 1. Запуск Map фази (паралельно)
        const mapResults = await runMapPhase(file, numWorkers, mapFunctionString)
        
        console.log("Map phase finished. Results:", mapResults)

        // 2. Запуск Reduce фази (в головному потоці або окремому воркері)
        // Спочатку об'єднуємо всі масиви від воркерів в один плоский масив
        const flatResults = mapResults.flat()
        
        // Відновлюємо функцію reduce
        const reduceFunction = new Function('acc', 'curr', reduceFunctionString)
        
        // Виконуємо reduce
        // Припускаємо, що map повертає щось, що можна ітерувати, або ми просто ред'юсимо весь масив
        const finalResult = flatResults.reduce((acc, curr) => reduceFunction(acc, curr), {})
        
        console.log("Final Result:", finalResult)
        document.getElementById('result-output').innerText = JSON.stringify(finalResult, null, 2)

    } catch (error) {
        console.error("MapReduce failed:", error)
    }
}

function runMapReduce(sharedBuffer, size, numWorkers, mapFunctionString, reduceFunctionString) {
    const chunkSize = Math.ceil(size / numWorkers)
    const workers = []

    for (let i = 0; i < numWorkers; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, file.size)
        workers.push(spawnWorker(chunk, mapFnString))
    }

    return Promise.all(promises)
}

function spawnWorker(fileChunk, mapFnString) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('worker.js')

        worker.onmessage = function(event) {
            if (event.data.type === 'success') {
                resolve(event.data.result)
                worker.terminate() // Вбиваємо воркера після роботи
            } else if (event.data.type === 'error') {
                reject(event.data.error)
                worker.terminate()
            }
        }

        worker.onerror = function(err) {
            reject(err)
            worker.terminate()
        }

        // Відправляємо дані
        worker.postMessage({
            chunk: fileChunk,
            mapFunction: mapFnString
        })
    })
}
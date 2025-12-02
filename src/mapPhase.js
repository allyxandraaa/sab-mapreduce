// Map фаза MapReduce

export function spawnMapWorker(sharedBuffer, start, length, mapFunctionString) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('src/worker.js')

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

// Map фаза - дозволяє обробляти результати по мірі надходження (streaming)
export async function runMapPhase(sharedBuffer, bufferLength, numWorkers, mapFunctionString, onResultCallback) {
    const chunkSize = Math.ceil(bufferLength / numWorkers)
    const mapWorkers = []
    const results = []
    let completedCount = 0

    for (let i = 0; i < numWorkers; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, bufferLength)
        const length = end - start

        // Створюємо проміс для кожного воркера
        const workerPromise = spawnMapWorker(sharedBuffer, start, length, mapFunctionString)
            .then(result => {
                results[i] = result
                completedCount++
                
                // Викликаємо callback з результатом, коли воркер завершився
                if (onResultCallback) {
                    onResultCallback(result, i, completedCount, numWorkers)
                }
                
                return result
            })
        
        mapWorkers.push(workerPromise)
    }

    // Чекаємо завершення всіх воркерів
    await Promise.all(mapWorkers)
    return results
}


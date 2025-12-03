// Map фаза MapReduce
import { findSafeChunkStart, findSafeChunkEnd } from './chunkUtils.js'

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
    let lastEnd = 0

    for (let i = 0; i < numWorkers; i++) {
        const targetStart = i * chunkSize
        const targetEnd = Math.min((i + 1) * chunkSize, bufferLength)
        
        // Для першого воркера починаємо з 0
        // Для наступних - починаємо з кінця попереднього чанку і знаходимо безпечну межу
        let start
        if (i === 0) {
            start = 0
        } else {
            // Починаємо з кінця попереднього чанку (lastEnd) або targetStart (що більше)
            // targetStart використовується як орієнтир для рівномірного розподілу
            const searchStart = Math.max(lastEnd, targetStart)
            // Знаходимо безпечну межу для початку (не розрізає UTF-8 символи та слова)
            // Функція може повернути значення менше searchStart, тому перевіряємо
            start = findSafeChunkStart(sharedBuffer, searchStart, bufferLength)
            // Гарантуємо, що start >= lastEnd (не перекриваємо попередній чанк)
            if (start < lastEnd) {
                // Якщо безпечна межа менше lastEnd, шукаємо безпечну межу від lastEnd
                start = findSafeChunkStart(sharedBuffer, lastEnd, bufferLength)
                // Якщо все ще менше, використовуємо lastEnd (краще розрізати символ, ніж пропустити байти)
                if (start < lastEnd) {
                    start = lastEnd
                }
            }
        }
        
        // Для останнього воркера - до кінця файлу
        // Для інших - знаходимо безпечну межу
        let end
        if (i === numWorkers - 1) {
            end = bufferLength
        } else {
            // Знаходимо безпечну межу для кінця (не розрізає UTF-8 символи та слова)
            end = findSafeChunkEnd(sharedBuffer, targetEnd, bufferLength)
            // Переконуємося, що end >= start
            if (end < start) {
                end = Math.min(start + chunkSize, bufferLength)
            }
        }
        
        const length = end - start
        
        // Оновлюємо lastEnd для наступного воркера
        lastEnd = end

        // Пропускаємо воркерів з нульовою довжиною (досягли кінця файлу)
        if (length <= 0) {
            break
        }

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


// Головна логіка MapReduce
import { getFile, readFileAsArrayBuffer, readFilesAsText } from './fileUtils.js'
import { displayFormattedText } from './ui.js'
import { runMapPhase } from './mapPhase.js'
import { StreamingShuffle } from './shufflePhase.js'
import { runReducePhase } from './reducePhase.js'

export async function initializeMapReduce() {
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
        // 1. Map phase з streaming - воркери обробляють файл, Shuffle починає збирати дані по мірі надходження
        const shuffleCollector = new StreamingShuffle(numWorkers)
        
        const mapWorkersWithResults = await runMapPhase(
            sharedBuffer, 
            bufferLength, 
            numWorkers, 
            mapFunctionString,
            // Callback викликається, коли воркер завершив Map фазу
            (result, workerIndex, completedCount, totalWorkers) => {
                console.log(`Worker ${workerIndex} completed Map phase (${completedCount}/${totalWorkers})`)
                // Починаємо збирати дані для Shuffle одразу, не чекаючи інших воркерів
                shuffleCollector.addResult(result.result)
            }
        )
        
        console.log("Map phase finished. Results:", mapWorkersWithResults.map(w => w.result))

        // 2. Shuffle and Sort phase - виконуємо фінальне сортування та розподіл
        const shuffledData = shuffleCollector.finalize()
        console.log("Shuffle and Sort phase finished. Results:", shuffledData)

        // 3. Reduce phase - перевикористовуємо тих самих воркерів
        const reduceResults = await runReducePhase(mapWorkersWithResults, reduceFunctionString, shuffledData)
        console.log("Reduce phase finished. Results:", reduceResults)

        // 4. Фінальне об'єднання результатів від всіх воркерів
        const mergedResult = reduceResults.reduce((acc, curr) => {
            // Об'єднуємо об'єкти від різних воркерів
            return { ...acc, ...curr }
        }, {})

        // 5. Сортуємо ключі для кращого відображення
        const sortedKeys = Object.keys(mergedResult).sort((a, b) => 
            String(a).localeCompare(String(b))
        )
        const finalResult = {}
        sortedKeys.forEach(key => {
            finalResult[key] = mergedResult[key]
        })

        console.log("Final Result:", finalResult)

        // 6. Термінуємо всіх воркерів
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


// Reduce фаза MapReduce

export function runReducePhase(workersWithResults, reduceFunctionString, shuffledData) {
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


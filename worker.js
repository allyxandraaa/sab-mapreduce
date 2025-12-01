self.onmessage = function(event) {
    try {
        const { phase, sharedBuffer, start, length, mapFunction, reduceFunction, data } = event.data

        if (phase === 'map') {
            // Фаза Map: обробка частини SharedArrayBuffer
            const sharedView = new Uint8Array(sharedBuffer, start, length)
            const chunkView = new Uint8Array(sharedView)
            
            const mapFunctionObj = new Function('view', 'start', 'length', mapFunction)
            const result = mapFunctionObj(chunkView, start, length)
            
            if (result === undefined) {
                throw new Error('Map function returned undefined. Make sure your map function has a return statement.')
            }
            
            const results = Array.isArray(result) ? result : [result]
            
            self.postMessage({
                type: 'success',
                phase: 'map',
                result: results
            })
            
        } else if (phase === 'reduce') {
            // Фаза Reduce: обробка результатів Map
            const reduceFunctionObj = new Function('acc', 'curr', reduceFunction)
            const initialValue = {}
            const result = data.reduce((acc, curr) => reduceFunctionObj(acc, curr), initialValue)
            
            self.postMessage({
                type: 'success',
                phase: 'reduce',
                result: result
            })
            
        } else {
            throw new Error(`Unknown phase: ${phase}`)
        }
        
    } catch (error) {
        const errorMessage = error.message || 'Unknown error'
        const errorName = error.name || 'Error'
        
        let fullErrorMessage = `${errorName}: ${errorMessage}`
        
        if (errorMessage.includes('undefined')) {
            fullErrorMessage += '\n\nMake sure your function returns a value.'
        }
        
        self.postMessage({
            type: 'error',
            error: fullErrorMessage
        })
    }
}
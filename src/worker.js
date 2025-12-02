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
            // Фаза Reduce: обробка результатів після shuffle
            // data має формат: [[key, [values]], [key2, [values2]], ...]
            const reduceFunctionObj = new Function('acc', 'curr', reduceFunction)
            const initialValue = {}
            
            // Обробляємо кожну пару [key, [values]]
            const result = data.reduce((acc, curr) => {
                if (Array.isArray(curr) && curr.length === 2) {
                    const [key, values] = curr
                    // Створюємо об'єкт для поточного ключа
                    const currObj = { [key]: values }
                    // Викликаємо reduce функцію
                    const newAcc = reduceFunctionObj(acc, currObj)
                    // Переконуємося, що повертається об'єкт
                    return newAcc !== undefined ? newAcc : acc
                } else {
                    // Якщо формат інший, передаємо як є
                    const newAcc = reduceFunctionObj(acc, curr)
                    return newAcc !== undefined ? newAcc : acc
                }
            }, initialValue)
            
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


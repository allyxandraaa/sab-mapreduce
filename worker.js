self.onmessage = function(event) {
    try {
        const { sharedBuffer, start, length, mapFunction } = event.data

        // Create a view of the shared buffer
        const sharedView = new Uint8Array(sharedBuffer, start, length)
        // Copy to a regular (non-shared) Uint8Array so TextDecoder can work with it
        const chunkView = new Uint8Array(sharedView)
        
        const mapFunctionObj = new Function('view', 'start', 'length', mapFunction)
        
        const result = mapFunctionObj(chunkView, start, length)
        
        if (result === undefined) {
            throw new Error('Map function returned undefined. Make sure your map function has a return statement.')
        }
        
        const results = Array.isArray(result) ? result : [result]
        
        self.postMessage({
            type: 'success',
            result: results
        })
        
    } catch (error) {
        const errorMessage = error.message || 'Unknown error'
        const errorName = error.name || 'Error'
        
        let fullErrorMessage = `${errorName}: ${errorMessage}`
        
        if (errorMessage.includes('undefined')) {
            fullErrorMessage += '\n\nMake sure your map function returns a value:\n' +
                               'Example:\n' +
                               'const decoder = new TextDecoder("utf-8");\n' +
                               'const text = decoder.decode(view);\n' +
                               'return text.split(/\\s+/).length;'
        } else {
            fullErrorMessage += '\n\nMap function receives parameters: view (Uint8Array), start (number), length (number)'
        }
        
        self.postMessage({
            type: 'error',
            error: fullErrorMessage
        })
    }
}
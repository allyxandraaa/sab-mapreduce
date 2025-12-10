self.onmessage = async function(event) {
    try {
        const { phase, sharedBuffer, split, windowSize, memoryLimit } = event.data

        if (phase === 'divide') {
            const tailedLength = split.tailedEnd - split.start
            const splitView = new Uint8Array(sharedBuffer, split.start, tailedLength)
            
            const { computeSPrefixes, filterSPrefixesByFrequency, sortSPrefixesByFrequency } = 
                await import('../suffix-prefix/window.js')
            
            const sPrefixes = computeSPrefixes(splitView, windowSize, memoryLimit)
            const filtered = filterSPrefixesByFrequency(sPrefixes, 2)
            const sorted = sortSPrefixesByFrequency(filtered)
            
            self.postMessage({
                type: 'success',
                phase: 'divide',
                splitIndex: split.index,
                result: {
                    sPrefixes: sorted,
                    splitInfo: {
                        start: split.start,
                        end: split.end,
                        tailedEnd: split.tailedEnd,
                        length: split.length
                    }
                }
            })
        } else {
            throw new Error(`Unknown phase: ${phase}`)
        }
    } catch (error) {
        self.postMessage({
            type: 'error',
            error: error.message || 'Unknown error',
            stack: error.stack
        })
    }
}


self.onmessage = async function(event) {
    try {
        const { phase, sharedBuffer, split, windowSize, memoryLimit, partition } = event.data

        if (phase === 'divide') {
            const { createSplitView } = await import('./splitter.js')
            
            const splitView = createSplitView(sharedBuffer, split)
            
            const { computeSPrefixes } = await import('../suffix-prefix/sprefix.js')
            
            const sPrefixes = computeSPrefixes(
                splitView,
                split.start,
                split.end,
                split.tailedEnd,
                windowSize,
                event.data.targetPrefixes || null
            )
            
            self.postMessage({
                type: 'success',
                phase: 'divide',
                splitIndex: split.index,
                result: {
                    sPrefixes: sPrefixes,
                    splitInfo: {
                        start: split.start,
                        end: split.end,
                        tailedEnd: split.tailedEnd,
                        length: split.length
                    }
                }
            })
        } else if (phase === 'reduce') {
            const partition = event.data.partition || []
            
            const aggregated = new Map()
            partition.forEach(sp => {
                if (!sp || !sp.prefix) return
                const key = `${sp.prefix}_${sp.length}`
                const existing = aggregated.get(key)
                if (existing) {
                    existing.frequency += sp.frequency
                } else {
                    aggregated.set(key, {
                        prefix: sp.prefix,
                        frequency: sp.frequency,
                        length: sp.length
                    })
                }
            })
            
            self.postMessage({
                type: 'success',
                phase: 'reduce',
                partitionIndex: event.data.partitionIndex,
                result: {
                    sPrefixes: Array.from(aggregated.values())
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


import { createSplitView } from './splitter.js'
import { computeSPrefixes } from '../suffix-prefix/sprefix.js'
import { decodeSharedBuffer, buildGroupSubTrees } from '../subtree/helpers.js'

self.onmessage = function(event) {
    try {
        const { phase, sharedBuffer, split, windowSize, partition, group } = event.data

        if (phase === 'divide') {
            const splitView = createSplitView(sharedBuffer, split)
            
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
            const partitionData = partition || []
            
            const aggregated = new Map()
            partitionData.forEach(sp => {
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
        } else if (phase === 'subtree') {
            if (!sharedBuffer || !group) {
                throw new Error('Відсутні дані для побудови піддерева')
            }

            const text = decodeSharedBuffer(sharedBuffer)
            const { prefixTrees, groupTree } = buildGroupSubTrees(text, group)

            self.postMessage({
                type: 'success',
                phase: 'subtree',
                groupId: group.id,
                result: {
                    groupId: group.id,
                    totalFrequency: group.totalFrequency,
                    treeCount: prefixTrees.length,
                    prefixTrees,
                    groupTree
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


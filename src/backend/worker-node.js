import { parentPort, workerData } from 'worker_threads'
import { createSplitView } from '../divide/splitter.js'
import { computeSPrefixes } from '../suffix-prefix/sprefix.js'
import { buildGroupSubTrees, decodeSharedBuffer } from '../subtree/helpers.js'

parentPort.on('message', (event) => {
    try {
        const { phase, sharedBuffer, split, windowSize, partition, group, boundaries } = event

        if (phase === 'divide') {
            const splitView = createSplitView(sharedBuffer, split)
            
            const result = computeSPrefixes(
                splitView,
                split.start,
                split.end,
                split.tailedEnd,
                windowSize,
                event.targetPrefixes || null
            )
            
            const sPrefixes = result.sPrefixes || result
            const trie = result.trie || null
            
            parentPort.postMessage({
                type: 'success',
                phase: 'divide',
                splitIndex: split.index,
                result: {
                    sPrefixes: sPrefixes,
                    trie: trie,
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
            
            parentPort.postMessage({
                type: 'success',
                phase: 'reduce',
                partitionIndex: event.partitionIndex,
                result: {
                    sPrefixes: Array.from(aggregated.values())
                }
            })
        } else if (phase === 'subtree') {
            if (!sharedBuffer || !group) {
                throw new Error('Відсутні дані для побудови піддерева')
            }

            const view = decodeSharedBuffer(sharedBuffer)
            const boundariesData = boundaries || []
            const options = {
                useFrequencyTrie: event.useFrequencyTrie !== false,
                boundaries: boundariesData
            }
            const { suffixSubtrees } = buildGroupSubTrees(view, group, options)

            parentPort.postMessage({
                type: 'success',
                phase: 'subtree',
                groupId: group.id,
                result: {
                    groupId: group.id,
                    totalFrequency: group.totalFrequency,
                    treeCount: suffixSubtrees.length,
                    suffixSubtrees
                }
            })
        } else {
            throw new Error(`Unknown phase: ${phase}`)
        }
    } catch (error) {
        parentPort.postMessage({
            type: 'error',
            error: error.message || 'Unknown error',
            stack: error.stack
        })
    }
})

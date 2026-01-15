import { createSplitView } from './splitter.js'
import { computeSPrefixes } from '../suffix-prefix/sprefix.js'
import { decodeSharedBuffer, buildGroupSubTrees, buildGlobalSuffixTreeFromSubtrees } from '../subtree/helpers.js'

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
            const { suffixSubtrees, groupTree } = buildGroupSubTrees(text, group)

            self.postMessage({
                type: 'success',
                phase: 'subtree',
                groupId: group.id,
                result: {
                    groupId: group.id,
                    totalFrequency: group.totalFrequency,
                    treeCount: suffixSubtrees.length,
                    suffixSubtrees,
                    groupTree
                }
            })
        } else if (phase === 'global-tree') {
            if (!sharedBuffer || !Array.isArray(event.data.suffixSubtrees)) {
                throw new Error('Відсутні дані для побудови глобального дерева')
            }

            self.postMessage({
                type: 'progress',
                phase: 'global-tree',
                stage: 'start',
                meta: {
                    subtreeCount: event.data.suffixSubtrees.length,
                    bufferLength: sharedBuffer.byteLength
                }
            })

            const text = decodeSharedBuffer(sharedBuffer)

            self.postMessage({
                type: 'progress',
                phase: 'global-tree',
                stage: 'decoded',
                meta: {
                    textLength: text.length
                }
            })

            const globalTree = buildGlobalSuffixTreeFromSubtrees(text, event.data.suffixSubtrees)

            self.postMessage({
                type: 'progress',
                phase: 'global-tree',
                stage: 'build-complete',
                meta: {
                    suffixCount: globalTree?.suffixCount || 0,
                    nodeCount: globalTree?.nodes?.length || 0
                }
            })

            self.postMessage({
                type: 'success',
                phase: 'global-tree',
                result: globalTree
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


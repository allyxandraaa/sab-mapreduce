import { parentPort, workerData } from 'worker_threads'
import { createSplitView } from '../divide/splitter.js'
import { computeSPrefixes } from '../suffix-prefix/sprefix.js'
import { buildGroupSubTrees, decodeSharedBuffer } from '../subtree/helpers.js'

const textDecoder = new TextDecoder('utf-8')
let cachedSharedBuffer = null
let cachedDecodedText = null

function getSharedText(sharedBuffer) {
    if (cachedSharedBuffer === sharedBuffer && typeof cachedDecodedText === 'string') {
        return cachedDecodedText
    }

    const view = decodeSharedBuffer(sharedBuffer)
    cachedDecodedText = textDecoder.decode(view)
    cachedSharedBuffer = sharedBuffer
    return cachedDecodedText
}

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
            console.log(`[Worker ${workerData.workerId}] Отримано завдання subtree, перевіряємо дані...`)
            console.log(`[Worker ${workerData.workerId}] sharedBuffer: ${sharedBuffer ? 'присутній' : 'відсутній'}, group: ${group ? 'присутній' : 'відсутній'}`)
            
            if (!sharedBuffer || !group) {
                throw new Error('Відсутні дані для побудови піддерева')
            }

            console.log(`[Worker ${workerData.workerId}] Група ${group.id}, префіксів: ${group.prefixes?.length || 0}`)
            console.log(`[Worker ${workerData.workerId}] Декодуємо SharedBuffer (кешуємо текст)...`)
            const sharedText = getSharedText(sharedBuffer)
            console.log(`[Worker ${workerData.workerId}] SharedBuffer декодовано, довжина тексту: ${sharedText.length}`)
            
            const boundariesData = boundaries || []
            const options = {
                useFrequencyTrie: event.useFrequencyTrie !== false,
                boundaries: boundariesData
            }
            
            console.log(`[Worker ${workerData.workerId}] Починаємо buildGroupSubTrees для групи ${group.id}...`)
            const { suffixSubtrees } = buildGroupSubTrees(sharedText, group, options)
            console.log(`[Worker ${workerData.workerId}] buildGroupSubTrees завершено для групи ${group.id}, побудовано ${suffixSubtrees.length} піддерев`)

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
            console.log(`[Worker ${workerData.workerId}] Відправлено результат для групи ${group.id}`)
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

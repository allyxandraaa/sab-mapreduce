import { FrequencyTrie } from '../suffix-prefix/frequencyTrie.js'

export async function processIteratively(splits, config, executors) {
    const { executeMapRound, executeReduceRound } = executors
    
    let windowSize = config.windowSize
    const windowStepSize = config.windowStepSize || 1
    let targetPrefixes = null
    const finalPrefixes = []
    let iteration = 0

    while (true) {
        iteration++
        config.windowSize = windowSize

        console.log('[SPrefix] Початок ітерації', {
            iteration,
            windowSize,
            targetCount: targetPrefixes?.size || 0
        })

        const updatedSplits = splits.map(split => {
            const tail = Math.max(windowSize - 1, config.tailLength || windowSize)
            return {
                ...split,
                tailedEnd: Math.min(split.end + tail, split.totalSize || split.end + tail)
            }
        })

        let mapResults, partitions, reduceResults, mergedTrie
        
        try {
            mapResults = await executeMapRound(updatedSplits, targetPrefixes)
            console.log('[SPrefix] Map завершено, результатів:', mapResults.length)
        } catch (err) {
            console.error('[SPrefix] Помилка Map раунду:', err)
            throw err
        }
        
        try {
            partitions = shuffleByKey(mapResults, config.numWorkers)
            console.log('[SPrefix] Shuffle завершено, партицій:', partitions.length)
        } catch (err) {
            console.error('[SPrefix] Помилка Shuffle:', err)
            throw err
        }
        
        try {
            reduceResults = await executeReduceRound(partitions)
            console.log('[SPrefix] Reduce завершено, результатів:', reduceResults.length)
        } catch (err) {
            console.error('[SPrefix] Помилка Reduce раунду:', err)
            throw err
        }
        
        mergedTrie = buildTrieFromReduceResults(reduceResults)

        const { accepted, needsExtension } = mergedTrie.partitionByFrequency(config.memoryLimit, windowSize)

        accepted.forEach(sp => {
            finalPrefixes.push({ prefix: sp.prefix, frequency: sp.frequency, length: windowSize })
        })

        console.info('[SPrefix] Ітерація з Frequency Trie', {
            windowSize,
            acceptedCount: accepted.length,
            needsExtensionCount: needsExtension.length
        })

        if (needsExtension.length > 0) {
            const extensionSample = needsExtension.slice(0, 5).map(p => ({
                prefix: p.prefix.substring(0, 20) + (p.prefix.length > 20 ? '...' : ''),
                frequency: p.frequency,
                length: p.prefix.length
            }))
            console.log('[SPrefix] needsExtension зразок:', extensionSample)
        }

        if (needsExtension.length === 0) {
            console.log('[SPrefix] Всі префікси оброблено, завершення ітерацій')
            console.log('[SPrefix] Зібрано finalPrefixes:', finalPrefixes.length)
            break
        }

        targetPrefixes = new Set(needsExtension.map(p => p.prefix))
        windowSize += windowStepSize

        if (windowSize > 100) {
            console.error('[SPrefix] Досягнуто максимум windowSize=100, залишилось префіксів:', needsExtension.length)
            throw new Error('Досягнуто максимальний розмір вікна. Неможливо обробити всі префікси в межах memoryLimit.')
        }
    }

    console.log('[SPrefix] Початок prunePrefixes для', finalPrefixes.length, 'префіксів')
    const pruned = prunePrefixes(finalPrefixes)
    console.log('[SPrefix] prunePrefixes завершено, результат:', pruned.length)
    return pruned
}

function prunePrefixes(prefixes) {
    if (prefixes.length <= 1) return prefixes

    const sorted = [...prefixes].sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length
        return a.prefix.localeCompare(b.prefix)
    })
    
    const result = []
    const trieRoot = new Map()
    
    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i]
        const prefix = current.prefix
        
        let isCovered = false
        let node = trieRoot
        
        for (let j = 0; j < prefix.length; j++) {
            const char = prefix[j]
            
            if (node.has('$END$')) {
                isCovered = true
                break
            }
            
            if (!node.has(char)) {
                break
            }
            
            node = node.get(char)
        }
        
        if (!isCovered) {
            result.push(current)
            
            node = trieRoot
            for (let j = 0; j < prefix.length; j++) {
                const char = prefix[j]
                if (!node.has(char)) {
                    node.set(char, new Map())
                }
                node = node.get(char)
            }
            node.set('$END$', true)
        }
    }

    return result
}

function buildTrieFromReduceResults(reduceResults) {
    const trie = new FrequencyTrie()
    if (!Array.isArray(reduceResults)) {
        return trie
    }

    reduceResults.forEach(result => {
        const prefixes = result?.sPrefixes || []
        prefixes.forEach(sp => {
            if (!sp || !sp.prefix) return
            const freq = sp.frequency || 0
            if (freq <= 0) return
            trie.insert(sp.prefix, freq)
        })
    })

    return trie
}

function shuffleByKey(mapResults, numPartitions) {
    const partitions = Array.from({ length: numPartitions }, () => [])
    
    mapResults.forEach(result => {
        const sPrefixes = result?.sPrefixes || []
        sPrefixes.forEach(sp => {
            if (!sp || !sp.prefix) return
            const hash = hashString(sp.prefix)
            const partitionIndex = hash % numPartitions
            partitions[partitionIndex].push(sp)
        })
    })
    
    return partitions
}

function hashString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return Math.abs(hash)
}

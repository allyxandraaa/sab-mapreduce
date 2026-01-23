import { FrequencyTrie } from '../suffix-prefix/frequencyTrie.js'
import { logger } from '../utils/logger.js'

export async function processIteratively(splits, config, executors) {
    const { executeMapRound, executeReduceRound } = executors
    
    let windowSize = config.windowSize
    const windowStepSize = config.windowStepSize || 1
    let targetPrefixes = null
    const finalPrefixes = []

    while (true) {
        config.windowSize = windowSize

        const updatedSplits = splits.map(split => {
            const tail = Math.max(windowSize - 1, config.tailLength || windowSize)
            return {
                ...split,
                tailedEnd: Math.min(split.end + tail, split.totalSize || split.end + tail)
            }
        })

        logger.log('SPrefix', `Починаємо раунд зіставлення для розміру вікна=${windowSize}, цільові префікси=${targetPrefixes ? targetPrefixes.size : 'немає'}`)
        const mapResults = await executeMapRound(updatedSplits, targetPrefixes)
        logger.log('SPrefix', `Раунд зіставлення завершено, отримано ${mapResults.length} результатів`)
        
        const partitions = shuffleByKey(mapResults, config.numWorkers)
        logger.log('SPrefix', `Перемішування ключів завершено, створено ${partitions.length} партицій`)
        
        logger.log('SPrefix', 'Починаємо раунд згортання')
        const reduceResults = await executeReduceRound(partitions)
        logger.log('SPrefix', `Раунд згортання завершено, отримано ${reduceResults.length} результатів`)
        
        const mergedTrie = buildTrieFromReduceResults(reduceResults)
        logger.log('SPrefix', 'Префіксне дерево побудовано, запускаємо розподіл за частотою')

        const { accepted, needsExtension } = mergedTrie.partitionByFrequency(config.memoryLimit, windowSize)
        logger.log('SPrefix', `Розподіл за частотою завершено: прийнято=${accepted.length}, потребують розширення=${needsExtension.length}`)

        accepted.forEach(sp => {
            finalPrefixes.push({ prefix: sp.prefix, frequency: sp.frequency, length: windowSize })
        })

        logger.info('SPrefix', 'Ітерація з частотним деревом', {
            windowSize,
            acceptedCount: accepted.length,
            needsExtensionCount: needsExtension.length
        })

        if (needsExtension.length === 0) {
            logger.log('SPrefix', 'Всі префікси оброблено, виходимо з циклу')
            break
        }

        targetPrefixes = new Set(needsExtension.map(p => p.prefix))
        windowSize += windowStepSize
        logger.log('SPrefix', `Переходимо до наступної ітерації з розміром вікна=${windowSize}`)

        if (windowSize > 100) {
            throw new Error('Досягнуто максимальний розмір вікна. Неможливо обробити всі префікси в межах memoryLimit.')
        }
    }

    return {
        prefixes: prunePrefixes(finalPrefixes),
        finalWindowSize: windowSize
    }
}

function prunePrefixes(prefixes) {
    if (prefixes.length <= 1) return prefixes

    const sorted = [...prefixes].sort((a, b) => a.length - b.length)
    const result = []
    const covered = new Set()

    for (const prefix of sorted) {
        let isCovered = false
        for (const coveredPrefix of covered) {
            if (prefix.prefix.startsWith(coveredPrefix)) {
                isCovered = true
                break
            }
        }

        if (!isCovered) {
            result.push(prefix)
            covered.add(prefix.prefix)
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

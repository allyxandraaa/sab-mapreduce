import { FrequencyTrie } from '../suffix-prefix/frequencyTrie.js'

/**
 * Обчислює хеш-значення для префікса.
 * Використовується для детермінованого розподілу префіксів по партиціях.
 * Один і той самий префікс завжди отримає один і той самий хеш.
 */
function hashPrefix(prefix) {
    let hash = 0
    for (let i = 0; i < prefix.length; i++) {
        hash = ((hash << 5) - hash) + prefix.charCodeAt(i)
        hash = hash & hash
    }
    return Math.abs(hash)
}

// Фаза Shuffling: групує дані за ключем (префіксом).
export function shuffleByKey(results, numPartitions = 4) {
    const partitions = Array.from({ length: numPartitions }, () => [])
    
    results.forEach(result => {
        if (!result) return
        
        // Підтримка нового формату з sPrefixes
        const sPrefixes = result.sPrefixes || []
        
        sPrefixes.forEach(sp => {
            const key = sp.prefix
            const partitionIndex = hashPrefix(key) % numPartitions
            partitions[partitionIndex].push({
                prefix: sp.prefix,
                frequency: sp.frequency,
                length: sp.length
            })
        })
    })
    
    return partitions
}

/**
 * Об'єднує Frequency Tries від різних сплітів.
 * Згідно з DGST paper (Section 5.2) - об'єднання локальних tries.
 * @param {Array<Object>} results - результати від воркерів з серіалізованими tries
 * @returns {FrequencyTrie}
 */
export function mergeFrequencyTries(results) {
    const mergedTrie = new FrequencyTrie()
    
    results.forEach(result => {
        if (!result || !result.trie) return
        const trie = FrequencyTrie.deserialize(result.trie)
        mergedTrie.merge(trie)
    })
    
    return mergedTrie
}


// Локальна агрегація: підсумовує частоти для префіксів в одній партиції.
// Використовується в Reduce фазі на кожному воркері.
export function aggregateSPrefixes(shuffledPartitions) {
    const aggregated = new Map()
    
    shuffledPartitions.forEach(partition => {
        partition.forEach(sp => {
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
    })
    
    return Array.from(aggregated.values())
}

// Фінальна агрегація: об'єднує результати від Reduce воркерів.
// Виконується в головному контексті після отримання всіх результатів.
export function mergeReduceResults(reduceResults) {
    const finalMap = new Map()
    
    reduceResults.forEach(result => {
        if (!result || !result.sPrefixes) return
        
        result.sPrefixes.forEach(sp => {
            const key = `${sp.prefix}_${sp.length}`
            const existing = finalMap.get(key)
            if (existing) {
                existing.frequency += sp.frequency
            } else {
                finalMap.set(key, {
                    prefix: sp.prefix,
                    frequency: sp.frequency,
                    length: sp.length
                })
            }
        })
    })
    
    return Array.from(finalMap.values())
}


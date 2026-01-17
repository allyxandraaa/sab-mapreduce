
function hashPrefix(prefix) {
    let hash = 0
    for (let i = 0; i < prefix.length; i++) {
        hash = ((hash << 5) - hash) + prefix.charCodeAt(i)
        hash = hash & hash
    }
    return Math.abs(hash)
}

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


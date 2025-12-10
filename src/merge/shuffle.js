export function aggregateSPrefixes(results) {
    const aggregated = new Map()
    
    results.forEach(result => {
        if (!result || !result.sPrefixes) return
        
        result.sPrefixes.forEach(sp => {
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


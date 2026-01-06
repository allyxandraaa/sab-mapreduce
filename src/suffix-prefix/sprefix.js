const decoder = new TextDecoder('utf-8')

export function computeSPrefixes(splitView, start, end, tailedEnd, windowSize, targetPrefixes) {
    const localCounts = new Map()
    const effectiveEnd = end - start
    const effectiveTailedEnd = tailedEnd - start
    
    for (let i = 0; i < effectiveEnd; i++) {
        if (i + windowSize > effectiveTailedEnd) break
        
        const slice = splitView.subarray(i, i + windowSize)
        
        let hasNewline = false
        for (let j = 0; j < slice.length; j++) {
            if (slice[j] === 0x0A || slice[j] === 0x0D) {
                hasNewline = true
                break
            }
        }
        if (hasNewline) continue
        
        const copy = new Uint8Array(slice)
        const prefix = decoder.decode(copy)
        
        if (targetPrefixes && targetPrefixes.length > 0) {
            const matches = targetPrefixes.some(target => prefix.startsWith(target))
            if (!matches) continue
        }
        
        localCounts.set(prefix, (localCounts.get(prefix) || 0) + 1)
    }
    
    const result = []
    for (const [prefix, frequency] of localCounts.entries()) {
        result.push({
            prefix: prefix,
            frequency: frequency,
            length: windowSize
        })
    }
    
    return result
}

export function filterSPrefixesByFrequency(sPrefixes, minFrequency = 2) {
    return sPrefixes.filter(sp => sp.frequency >= minFrequency)
}

export function sortSPrefixesByFrequency(sPrefixes) {
    return [...sPrefixes].sort((a, b) => b.frequency - a.frequency)
}


export function computeSPrefixes(splitView, start, end, tailedEnd, windowSize, targetPrefixes) {
    const localCounts = new Map()
    const effectiveEnd = end - start
    const effectiveTailedEnd = tailedEnd - start
    
    for (let i = 0; i < effectiveEnd; i++) {
        if (i + windowSize > effectiveTailedEnd) break
        
        const prefix = extractPrefix(splitView, i, windowSize)
        
        if (prefix.includes('\n') || prefix.includes('\r')) continue
        
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

function extractPrefix(split, start, length) {
    const slice = split.subarray(start, start + length)
    const copy = new Uint8Array(slice)
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(copy)
}

export function filterSPrefixesByFrequency(sPrefixes, minFrequency = 2) {
    return sPrefixes.filter(sp => sp.frequency >= minFrequency)
}

export function sortSPrefixesByFrequency(sPrefixes) {
    return [...sPrefixes].sort((a, b) => b.frequency - a.frequency)
}


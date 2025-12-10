export function computeSPrefixes(split, windowSize, memoryLimit) {
    const sPrefixes = []
    const splitLength = split.length
    const adaptiveWindowSize = calculateAdaptiveWindowSize(splitLength, windowSize, memoryLimit)
    const suffixes = generateSuffixes(split)
    
    for (let i = 0; i < suffixes.length; i++) {
        const currentSuffix = suffixes[i]
        const windowStart = Math.max(0, i - Math.floor(adaptiveWindowSize / 2))
        const windowEnd = Math.min(suffixes.length, i + Math.floor(adaptiveWindowSize / 2))
        
        for (let j = windowStart; j < windowEnd; j++) {
            if (i === j) continue
            
            const otherSuffix = suffixes[j]
            const commonPrefix = findLongestCommonPrefix(currentSuffix, otherSuffix)
            
            if (commonPrefix.length > 0) {
                const existingPrefix = sPrefixes.find(p => p.prefix === commonPrefix)
                
                if (existingPrefix) {
                    if (!existingPrefix.positions.includes(i)) {
                        existingPrefix.positions.push(i)
                        existingPrefix.frequency++
                    }
                } else {
                    sPrefixes.push({
                        prefix: commonPrefix,
                        frequency: 2,
                        positions: [i, j],
                        length: commonPrefix.length
                    })
                }
            }
        }
    }
    
    return sPrefixes
}

function generateSuffixes(split) {
    const suffixes = []
    for (let i = 0; i < split.length; i++) {
        suffixes.push(split.subarray(i))
    }
    return suffixes
}

function findLongestCommonPrefix(suffix1, suffix2) {
    const minLength = Math.min(suffix1.length, suffix2.length)
    let commonLength = 0
    
    for (let i = 0; i < minLength; i++) {
        if (suffix1[i] === suffix2[i]) {
            commonLength++
        } else {
            break
        }
    }
    
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(suffix1.subarray(0, commonLength))
}

function calculateAdaptiveWindowSize(splitLength, baseWindowSize, memoryLimit) {
    const estimatedMemory = splitLength * splitLength * 2
    
    if (estimatedMemory > memoryLimit) {
        const reductionFactor = memoryLimit / estimatedMemory
        return Math.max(2, Math.floor(baseWindowSize * reductionFactor))
    }
    
    return baseWindowSize
}

export function filterSPrefixesByFrequency(sPrefixes, minFrequency = 2) {
    return sPrefixes.filter(sp => sp.frequency >= minFrequency)
}

export function sortSPrefixesByFrequency(sPrefixes) {
    return [...sPrefixes].sort((a, b) => b.frequency - a.frequency)
}


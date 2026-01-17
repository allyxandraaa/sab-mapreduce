import { FrequencyTrie } from './frequencyTrie.js'
import { isTerminalSymbol } from './uts.js'

const decoder = new TextDecoder('utf-8')

export function computeSPrefixes(splitView, start, end, tailedEnd, windowSize, targetPrefixes) {
    const effectiveEnd = end - start
    const effectiveTailedEnd = tailedEnd - start
    
    return computeSPrefixesWithTrie(splitView, effectiveEnd, effectiveTailedEnd, windowSize, targetPrefixes)
}

function computeSPrefixesWithTrie(splitView, effectiveEnd, effectiveTailedEnd, windowSize, targetPrefixes) {
    const trie = new FrequencyTrie()
    const targetSet = targetPrefixes && targetPrefixes.length > 0 ? new Set(targetPrefixes) : null
    
    for (let i = 0; i < effectiveEnd; i++) {
        if (i + windowSize > effectiveTailedEnd) break
        
        const slice = splitView.subarray(i, i + windowSize)
        
        let hasInvalidChar = false
        for (let j = 0; j < slice.length; j++) {
            const byte = slice[j]
            if (byte === 0x0A || byte === 0x0D) {
                hasInvalidChar = true
                break
            }
            if (byte === 0x24 && j < slice.length - 1) {
                hasInvalidChar = true
                break
            }
        }
        if (hasInvalidChar) continue
        
        const copy = new Uint8Array(slice)
        const prefix = decoder.decode(copy)
        
        let hasUTS = false
        for (let j = 0; j < prefix.length - 1; j++) {
            if (isTerminalSymbol(prefix[j])) {
                hasUTS = true
                break
            }
        }
        if (hasUTS) continue
        
        if (targetSet) {
            let matches = false
            for (const target of targetSet) {
                if (prefix.startsWith(target)) {
                    matches = true
                    break
                }
            }
            if (!matches) continue
        }
        
        trie.insert(prefix)
    }
    
    const prefixes = trie.collectPrefixes(windowSize)
    return {
        trie: trie.serialize(),
        sPrefixes: prefixes
    }
}

export function filterSPrefixesByFrequency(sPrefixes, minFrequency = 2) {
    return sPrefixes.filter(sp => sp.frequency >= minFrequency)
}

export function sortSPrefixesByFrequency(sPrefixes) {
    return [...sPrefixes].sort((a, b) => b.frequency - a.frequency)
}

export function mergeFrequencyTries(serializedTries) {
    const mergedTrie = new FrequencyTrie()
    for (const serialized of serializedTries) {
        if (!serialized) continue
        const trie = FrequencyTrie.deserialize(serialized)
        mergedTrie.merge(trie)
    }
    return mergedTrie
}

export function partitionPrefixesByFrequency(trie, frequencyLimit, currentWindowSize) {
    const { accepted, needsExtension } = trie.partitionByFrequency(frequencyLimit, currentWindowSize)
    const extensionSet = new Set(needsExtension.map(p => p.prefix))
    return { accepted, needsExtension: extensionSet }
}


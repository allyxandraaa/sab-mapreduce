import { FrequencyTrie } from './frequencyTrie.js'
import { isSeparator, isTerminator } from '../init/uts.js'

const decoder = new TextDecoder('utf-8')

export function computeSPrefixes(splitView, start, tailedEnd, windowSize, targetPrefixes) {
    const effectiveTailedEnd = Math.max(0, tailedEnd - start)
    
    return computeSPrefixesWithTrie(splitView, effectiveTailedEnd, windowSize, targetPrefixes)
}

function computeSPrefixesWithTrie(splitView, effectiveTailedEnd, windowSize, targetPrefixes) {
    const trie = new FrequencyTrie()
    let targetSet = null
    if (targetPrefixes) {
        if (targetPrefixes instanceof Set) {
            targetSet = targetPrefixes
        } else if (Array.isArray(targetPrefixes) || typeof targetPrefixes[Symbol.iterator] === 'function') {
            targetSet = new Set(targetPrefixes)
        }
    }
    
    for (let i = 0; i < effectiveTailedEnd; ) {
        if (i + windowSize > effectiveTailedEnd) break
        
        if (i < splitView.length) {
            // перевірка на continuation bytes
            const currentByte = splitView[i]
            if ((currentByte & 0xC0) === 0x80) {
                i++
                continue
            }
        }
        
        let endPos = i + windowSize
        let charByteLength = 1
        
        if (windowSize === 1 && i < splitView.length) {
            const firstByte = splitView[i]
            if ((firstByte & 0x80) === 0) {
                charByteLength = 1  // ASCII символ
            } else if ((firstByte & 0xF0) === 0xE0) {
                charByteLength = 3  // 3-байтовий символ (термінатор U+E001 або сепаратор U+E000)
            }
            endPos = Math.min(i + charByteLength, effectiveTailedEnd)
        }
        
        const slice = splitView.subarray(i, endPos)
        
        let hasInvalidChar = false
        for (let j = 0; j < slice.length; j++) {
            const byte = slice[j]
            if (byte === 0x0A || byte === 0x0D) {
                hasInvalidChar = true
                break
            }
        }
        if (hasInvalidChar) {
            i += charByteLength
            continue
        }
        
        const copy = new Uint8Array(slice)
        const prefix = decoder.decode(copy)
        
        if (!prefix || prefix.includes('\uFFFD')) {
            i += charByteLength
            continue
        }
        
        let crossesBoundary = false
        for (let j = 0; j < prefix.length; j++) {
            const char = prefix[j]
            if (isSeparator(char) || isTerminator(char)) {
                if (prefix.length === 1) {
                    break
                }
                crossesBoundary = true
                break
            }
        }
        if (crossesBoundary) {
            i += charByteLength
            continue
        }
        
        if (targetSet && targetSet.size > 0) {
            let matches = false
            for (const target of targetSet) {
                if (prefix.startsWith(target)) {
                    matches = true
                    break
                }
            }
            if (!matches) {
                i += charByteLength
                continue
            }
        }
        
        trie.insert(prefix)
        i += charByteLength
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


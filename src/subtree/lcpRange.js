import { SEPARATOR_CODE, TERMINATOR_CODE } from '../init/uts.js'

function normalizeCharCodeForCompare(code) {
    if (code === TERMINATOR_CODE) return -2
    if (code === SEPARATOR_CODE) return -1
    return code
}

export class LCPRange {
    constructor(char, range, offset) {
        this.char = char
        this.range = range
        this.offset = offset
    }

    static compare(textA, posA, lcpRangeA, textB, posB, lcpRangeB) {
        if (lcpRangeA.offset > lcpRangeB.offset) {
            return { smaller: posA, larger: posB, lcpRange: lcpRangeB }
        }
        if (lcpRangeA.offset < lcpRangeB.offset) {
            return { smaller: posB, larger: posA, lcpRange: lcpRangeA }
        }

        const rangeALen = lcpRangeA.range.length
        const rangeBLen = lcpRangeB.range.length
        const rangeMin = Math.min(rangeALen, rangeBLen)

        for (let i = 0; i < rangeMin; i++) {
            const charA = normalizeCharCodeForCompare(lcpRangeA.range.charCodeAt(i))
            const charB = normalizeCharCodeForCompare(lcpRangeB.range.charCodeAt(i))
            
            if (charA > charB) {
                const newRange = textA.slice(posA + lcpRangeA.offset + i, posA + lcpRangeA.offset + rangeALen)
                return {
                    smaller: posB,
                    larger: posA,
                    lcpRange: new LCPRange(lcpRangeB.range.charAt(i), newRange, lcpRangeB.offset + i)
                }
            }
            if (charA < charB) {
                const newRange = textB.slice(posB + lcpRangeB.offset + i, posB + lcpRangeB.offset + rangeBLen)
                return {
                    smaller: posA,
                    larger: posB,
                    lcpRange: new LCPRange(lcpRangeA.range.charAt(i), newRange, lcpRangeA.offset + i)
                }
            }
        }

        return {
            smaller: posA,
            larger: posB,
            lcpRange: new LCPRange('\0', '', -(rangeMin + lcpRangeA.offset))
        }
    }

    static build(text, posA, posB, rangeSize = 32) {
        let offset = 0
        const len = text.length
        
        while (posA + offset < len && posB + offset < len && 
               text.charCodeAt(posA + offset) === text.charCodeAt(posB + offset)) {
            offset++
        }

        if (posA + offset >= len || posB + offset >= len) {
            return new LCPRange('\0', '', offset)
        }

        const char = text.charAt(posB + offset)
        const rangeEnd = Math.min(posA + offset + rangeSize, len)
        const range = text.slice(posA + offset, rangeEnd)
        
        return new LCPRange(char, range, offset)
    }
}

export function buildSuffixArrayWithLCPRange(text, positions, rangeSize = 32) {
    if (positions.length === 0) {
        return { suffixArray: [], lcpRanges: [] }
    }
    if (positions.length === 1) {
        return { 
            suffixArray: positions, 
            lcpRanges: [new LCPRange('\0', text.slice(positions[0], Math.min(positions[0] + rangeSize, text.length)), 0)]
        }
    }

    const textLen = text.length
    
    const sortedPositions = lcpMergeSort(text, textLen, positions)
    const suffixArray = sortedPositions
    const lcpRanges = new Array(sortedPositions.length)
    
    const firstPos = sortedPositions[0]
    lcpRanges[0] = new LCPRange('\0', text.slice(firstPos, Math.min(firstPos + rangeSize, textLen)), 0)

    for (let i = 1; i < sortedPositions.length; i++) {
        lcpRanges[i] = LCPRange.build(text, sortedPositions[i], sortedPositions[i - 1], rangeSize)
    }

    return { suffixArray, lcpRanges }
}

function lcpMergeSort(text, textLen, positions) {
    const n = positions.length
    if (n <= 1) return positions
    if (n <= 32) {
        return quickInsertionSort(text, textLen, positions)
    }
    
    const mid = n >>> 1 
    const left = lcpMergeSort(text, textLen, positions.slice(0, mid))
    const right = lcpMergeSort(text, textLen, positions.slice(mid))
    
    return lcpMerge(text, textLen, left, right)
}

function lcpMerge(text, textLen, left, right) {
    const result = new Array(left.length + right.length)
    let i = 0, j = 0, k = 0

    let lcpWithLeft = 0
    let lcpWithRight = 0
    
    while (i < left.length && j < right.length) {
        const posL = left[i]
        const posR = right[j]
    
        const startOffset = Math.min(lcpWithLeft, lcpWithRight)
        const cmp = compareSuffixesFrom(text, textLen, posL, posR, startOffset)
        
        if (cmp <= 0) {
            result[k++] = posL
            i++
          
            if (i < left.length) {
                lcpWithLeft = 0  
            }
        } else {
            result[k++] = posR
            j++
            if (j < right.length) {
                lcpWithRight = 0
            }
        }
    }
    
    while (i < left.length) {
        result[k++] = left[i++]
    }
    while (j < right.length) {
        result[k++] = right[j++]
    }
    
    return result
}

function quickInsertionSort(text, textLen, positions) {
    const n = positions.length
    const result = new Array(n)
    for (let x = 0; x < n; x++) result[x] = positions[x]
    
    for (let i = 1; i < n; i++) {
        const current = result[i]
        let j = i - 1
        
        while (j >= 0) {
            const cmp = compareSuffixesFast(text, textLen, result[j], current)
            if (cmp <= 0) break
            result[j + 1] = result[j]
            j--
        }
        result[j + 1] = current
    }
    
    return result
}

function compareSuffixesFrom(text, textLen, posA, posB, startOffset) {
    if (posA === posB) return 0
    
    let offset = startOffset
    const maxA = textLen - posA
    const maxB = textLen - posB
    const maxOffset = Math.min(maxA, maxB)
    
    while (offset < maxOffset) {
        const codeA = text.charCodeAt(posA + offset)
        const codeB = text.charCodeAt(posB + offset)
        
        const normA = codeA === TERMINATOR_CODE ? -2 : (codeA === SEPARATOR_CODE ? -1 : codeA)
        const normB = codeB === TERMINATOR_CODE ? -2 : (codeB === SEPARATOR_CODE ? -1 : codeB)
        
        if (normA !== normB) {
            return normA - normB
        }
        offset++
    }
    
    return maxA - maxB
}

function compareSuffixesFast(text, textLen, posA, posB) {
    if (posA === posB) return 0
    
    const maxA = textLen - posA
    const maxB = textLen - posB
    const maxOffset = Math.min(maxA, maxB)
    
    for (let offset = 0; offset < maxOffset; offset++) {
        const codeA = text.charCodeAt(posA + offset)
        const codeB = text.charCodeAt(posB + offset)
        
        if (codeA !== codeB) {
            const normA = codeA === TERMINATOR_CODE ? -2 : (codeA === SEPARATOR_CODE ? -1 : codeA)
            const normB = codeB === TERMINATOR_CODE ? -2 : (codeB === SEPARATOR_CODE ? -1 : codeB)
            return normA - normB
        }
    }
    
    return maxA - maxB
}

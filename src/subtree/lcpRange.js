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

    const items = positions.map(pos => ({
        pos,
        lcpRange: null
    }))

    const sortedItems = []
    for (const item of items) {
        let inserted = false
        for (let i = 0; i < sortedItems.length; i++) {
            let cmp
            if (item.lcpRange && sortedItems[i].lcpRange) {
                const result = LCPRange.compare(text, item.pos, item.lcpRange, text, sortedItems[i].pos, sortedItems[i].lcpRange)
                if (result && result.lcpRange && result.lcpRange.offset >= 0) {
                    if (result.smaller === item.pos) {
                        sortedItems[i].lcpRange = result.lcpRange
                        cmp = -1
                    } else {
                        item.lcpRange = result.lcpRange
                        cmp = 1
                    }
                } else {
                    cmp = compareSuffixesDirect(text, item.pos, sortedItems[i].pos)
                }
            } else {
                cmp = compareSuffixesDirect(text, item.pos, sortedItems[i].pos)
            }
            
            if (cmp < 0) {
                sortedItems.splice(i, 0, item)
                inserted = true
                break
            }
        }
        if (!inserted) {
            sortedItems.push(item)
        }
    }
    
    const sortedPositions = sortedItems.map(item => item.pos)

    const suffixArray = []
    const lcpRanges = []

    for (let i = 0; i < sortedPositions.length; i++) {
        suffixArray.push(sortedPositions[i])
        
        if (i === 0) {
            const rangeEnd = Math.min(sortedPositions[i] + rangeSize, text.length)
            lcpRanges.push(new LCPRange('\0', text.slice(sortedPositions[i], rangeEnd), 0))
        } else {
            const lcpRange = LCPRange.build(text, sortedPositions[i], sortedPositions[i - 1], rangeSize)
            lcpRanges.push(lcpRange)
        }
    }

    return { suffixArray, lcpRanges }
}

function compareSuffixesDirect(text, posA, posB) {
    if (posA === posB) return 0
    const len = text.length
    let offset = 0
    
    while (posA + offset < len && posB + offset < len) {
        const charCodeA = normalizeCharCodeForCompare(text.charCodeAt(posA + offset))
        const charCodeB = normalizeCharCodeForCompare(text.charCodeAt(posB + offset))
        if (charCodeA !== charCodeB) {
            return charCodeA - charCodeB
        }
        offset++
    }
    
    // Коротший суфікс менший
    return (len - posA) - (len - posB)
}

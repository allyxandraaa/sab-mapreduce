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
            const charA = lcpRangeA.range.charCodeAt(i)
            const charB = lcpRangeB.range.charCodeAt(i)
            
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

    items.sort((a, b) => {
        if (a.lcpRange && b.lcpRange) {
            const result = LCPRange.compare(text, a.pos, a.lcpRange, text, b.pos, b.lcpRange)
            if (result.lcpRange.offset >= 0) {
                if (result.smaller === a.pos) {
                    b.lcpRange = result.lcpRange
                    return -1
                } else {
                    a.lcpRange = result.lcpRange
                    return 1
                }
            }
        }

        return compareSuffixesDirect(text, a.pos, b.pos)
    })

    const suffixArray = []
    const lcpRanges = []

    for (let i = 0; i < items.length; i++) {
        suffixArray.push(items[i].pos)
        
        if (i === 0) {
            const rangeEnd = Math.min(items[i].pos + rangeSize, text.length)
            lcpRanges.push(new LCPRange('\0', text.slice(items[i].pos, rangeEnd), 0))
        } else {
            const lcpRange = LCPRange.build(text, items[i].pos, items[i - 1].pos, rangeSize)
            lcpRanges.push(lcpRange)
        }
    }

    return { suffixArray, lcpRanges }
}

function compareSuffixesDirect(text, posA, posB) {
    // posA === posB
    if (posA === posB) return 0
    const len = text.length
    let offset = 0
    
    while (posA + offset < len && posB + offset < len) {
        const charCodeA = text.charCodeAt(posA + offset)
        const charCodeB = text.charCodeAt(posB + offset)
        if (charCodeA !== charCodeB) {
            // posA < posB
            return charCodeA - charCodeB
        }
        offset++
    }
    
    // posA > posB
    return (len - posA) - (len - posB)
}

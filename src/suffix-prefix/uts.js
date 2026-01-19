const PRIVATE_USE_SEPARATOR = 0xE000
const PRIVATE_USE_TERMINATOR = 0xE001

export const SEPARATOR = String.fromCodePoint(PRIVATE_USE_SEPARATOR)
export const TERMINATOR = String.fromCodePoint(PRIVATE_USE_TERMINATOR)

const SEPARATOR_VISIBLE = '#'
const TERMINATOR_VISIBLE = '$'

export function isSeparator(char) {
    return char === SEPARATOR
}

export function isTerminator(char) {
    return char === TERMINATOR
}

export function toVisibleChar(char) {
    if (char === SEPARATOR) {
        return SEPARATOR_VISIBLE
    }
    if (char === TERMINATOR) {
        return TERMINATOR_VISIBLE
    }
    return char
}

export function toVisibleText(text = '') {
    if (typeof text !== 'string' || text.length === 0) {
        return typeof text === 'string' ? text : ''
    }

    let result = ''
    for (const char of text) {
        result += toVisibleChar(char)
    }
    return result
}

export class UTSManager {
    constructor() {
        this.mergedText = ''
        this.boundaries = []
    }

    reset() {
        this.mergedText = ''
        this.boundaries = []
    }

    initializeMultiple(files = []) {
        this.reset()

        const chunks = Array.isArray(files) ? files : []
        const parts = []
        const boundaries = []
        let cursor = 0

        chunks.forEach((chunk, index) => {
            const text = typeof chunk?.text === 'string' ? chunk.text : ''
            const label = typeof chunk?.name === 'string' ? chunk.name : `file-${index}`
            const start = cursor
            const end = start + text.length

            boundaries.push({
                index,
                name: label,
                start,
                end
            })

            parts.push(text)
            cursor = end + 1
        })

        this.mergedText = parts.join(SEPARATOR) + TERMINATOR
        this.boundaries = boundaries
        return this.mergedText
    }

    getMergedText() {
        return this.mergedText
    }

    getBoundaries() {
        return [...this.boundaries]
    }

    findStringId(globalIndex) {
        for (let i = 0; i < this.boundaries.length; i++) {
            const boundary = this.boundaries[i]
            if (globalIndex >= boundary.start && globalIndex < boundary.end) {
                return {
                    stringId: boundary.index,
                    stringName: boundary.name,
                    localIndex: globalIndex - boundary.start
                }
            }
        }
        return null
    }
}


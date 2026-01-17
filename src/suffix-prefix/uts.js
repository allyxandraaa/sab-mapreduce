const PRIVATE_USE_START = 0xE000
const PRIVATE_USE_END = 0xF8FF
const VISIBLE_TERMINAL_CANDIDATES = Object.freeze([
    '$', '&', '#', '@', '%', '§', '¶', '¤', '†', '‡', '•', '☼'
])

function buildVisiblePool(customVisible = null) {
    const preferred = Array.isArray(customVisible) && customVisible.length
        ? customVisible
        : VISIBLE_TERMINAL_CANDIDATES

    return preferred.filter(symbol => typeof symbol === 'string' && symbol.length > 0)
}

function buildPrivatePool() {
    const pool = []
    for (let code = PRIVATE_USE_START; code <= PRIVATE_USE_END; code++) {
        pool.push(String.fromCharCode(code))
    }
    return pool
}

const PRIVATE_TERMINAL_POOL = buildPrivatePool()
export const DEFAULT_TERMINAL = PRIVATE_TERMINAL_POOL[0]

export function isTerminalSymbol(char) {
    if (char === undefined || char === null) {
        return false
    }

    const codePoint = typeof char === 'number' ? char : String(char).codePointAt(0)
    if (Number.isNaN(codePoint)) {
        return false
    }

    return codePoint >= PRIVATE_USE_START && codePoint <= PRIVATE_USE_END
}

function appendTerminalSymbol(text = '', terminal = DEFAULT_TERMINAL) {
    if (typeof text !== 'string') {
        return ''
    }

    return `${text}${terminal}`
}

export class UTSManager {
    constructor(options = {}) {
        this.originalText = ''
        this.mergedText = ''
        this.boundaries = []
        this.terminalSymbol = options.terminalSymbol || DEFAULT_TERMINAL
        this.terminalPool = [...PRIVATE_TERMINAL_POOL]
        this.visiblePool = buildVisiblePool(options.visibleTerminals)
        this.displayMap = new Map()
        this.visibleIndex = 0
    }

    reset() {
        this.originalText = ''
        this.mergedText = ''
        this.boundaries = []
    }

    initializeSingle(text = '') {
        this.reset()
        const safeTerminal = this._pickAvailableTerminal(text)
        this.terminalSymbol = safeTerminal
        this.originalText = text
        this.mergedText = appendTerminalSymbol(text, safeTerminal)
        this.boundaries.push({
            index: 0,
            start: 0,
            end: text.length,
            terminal: safeTerminal
        })
        return this.mergedText
    }

    initializeSplits(chunks = []) {
        this.reset()
        const combined = Array.isArray(chunks) ? chunks.join('') : ''
        const safeTerminal = this._pickAvailableTerminal(combined)
        this.terminalSymbol = safeTerminal

        let merged = ''
        chunks.forEach((chunk, index) => {
            const safeChunk = typeof chunk === 'string' ? chunk : ''
            const start = merged.length
            merged += safeChunk
            const end = merged.length
            this.boundaries.push({ index, start, end, terminal: safeTerminal })
            merged += safeTerminal
        })

        this.originalText = combined
        this.mergedText = merged
        return this.mergedText
    }

    getMergedText() {
        return this.mergedText
    }

    getTerminalSymbol() {
        return this.terminalSymbol
    }

    getBoundaries() {
        return [...this.boundaries]
    }

    getVisibleRepresentation(char) {
        if (typeof char !== 'string' || char.length === 0) {
            return ''
        }
        if (!isTerminalSymbol(char)) {
            return char
        }
        if (this.displayMap.has(char)) {
            return this.displayMap.get(char)
        }

        const visibleSymbol = this.visiblePool[this.visibleIndex % this.visiblePool.length] || '?'
        this.visibleIndex += 1
        this.displayMap.set(char, visibleSymbol)
        return visibleSymbol
    }

    _pickAvailableTerminal(text = '') {
        const haystack = typeof text === 'string' ? text : ''
        for (const symbol of this.terminalPool) {
            if (!haystack.includes(symbol)) {
                if (!this.displayMap.has(symbol)) {
                    const visibleSymbol = this.visiblePool[this.displayMap.size % this.visiblePool.length] || '?'
                    this.displayMap.set(symbol, visibleSymbol)
                }
                return symbol
            }
        }
        throw new Error('UTSManager: no available terminal symbols left in the Private Use Area range')
    }
}


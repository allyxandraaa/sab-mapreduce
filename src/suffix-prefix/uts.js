const PRIVATE_USE_START = 0xE000
const PRIVATE_USE_END = 0xF8FF

export const DEFAULT_TERMINAL = String.fromCharCode(PRIVATE_USE_START)

function buildTerminalPool() {
    const pool = []
    for (let code = PRIVATE_USE_START; code <= PRIVATE_USE_END; code++) {
        pool.push(String.fromCharCode(code))
    }
    return pool
}

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
        this.terminalPool = buildTerminalPool()
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

    _pickAvailableTerminal(text = '') {
        const haystack = typeof text === 'string' ? text : ''
        for (const symbol of this.terminalPool) {
            if (!haystack.includes(symbol)) {
                return symbol
            }
        }
        throw new Error('UTSManager: no available terminal symbols left in the Private Use Area range')
    }
}


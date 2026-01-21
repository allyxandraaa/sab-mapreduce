export const SEPARATOR_CODE = 0xE000
export const TERMINATOR_CODE = 0xE001

export const SEPARATOR = String.fromCodePoint(SEPARATOR_CODE)
export const TERMINATOR = String.fromCodePoint(TERMINATOR_CODE)

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

export function calculateBoundaries(files = []) {
    const chunks = Array.isArray(files) ? files : []
    const boundaries = []
    let cursor = 0

    chunks.forEach((chunk, index) => {
        const dataLength = chunk?.data?.length || 0
        const label = chunk?.name || `file-${index}`
        const start = cursor
        const end = start + dataLength

        boundaries.push({
            index,
            name: label,
            start,
            end
        })

        cursor = end
    })

    return boundaries
}

export function populateSharedBuffer(files, sharedBuffer) {
    const encoder = new TextEncoder()
    const separatorBytes = encoder.encode(SEPARATOR)
    const terminatorBytes = encoder.encode(TERMINATOR)
    
    const view = new Uint8Array(sharedBuffer)
    let cursor = 0
    
    files.forEach((file, idx) => {
        view.set(file.data, cursor)
        cursor += file.data.length
        
        if (idx < files.length - 1) {
            view.set(separatorBytes, cursor)
            cursor += separatorBytes.length
        }
    })
    
    view.set(terminatorBytes, cursor)
    cursor += terminatorBytes.length
    
    return cursor
}

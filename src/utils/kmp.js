/**
 * KMP (Knuth-Morris-Pratt) algorithm for efficient string pattern matching.
 * Time complexity: O(n + m) where n = text length, m = pattern length
 * Space complexity: O(m) for the failure function table
 */

/**
 * Build the failure function (partial match table) for KMP algorithm.
 * @param {string} pattern - The pattern to search for
 * @returns {Int32Array} - Failure function array
 */
export function buildFailureFunction(pattern) {
    const m = pattern.length
    const failure = new Int32Array(m)
    failure[0] = 0
    
    let k = 0
    for (let i = 1; i < m; i++) {
        while (k > 0 && pattern[k] !== pattern[i]) {
            k = failure[k - 1]
        }
        if (pattern[k] === pattern[i]) {
            k++
        }
        failure[i] = k
    }
    
    return failure
}

/**
 * Find all occurrences of a pattern in text using KMP algorithm.
 * @param {string} text - The text to search in
 * @param {string} pattern - The pattern to search for
 * @param {Int32Array} [failure] - Pre-computed failure function (optional)
 * @returns {number[]} - Array of starting positions where pattern occurs
 */
export function kmpFindAll(text, pattern, failure = null) {
    if (!pattern || pattern.length === 0) {
        return []
    }
    
    const n = text.length
    const m = pattern.length
    
    if (m > n) {
        return []
    }
    
    const f = failure || buildFailureFunction(pattern)
    const positions = []
    
    let j = 0 // Position in pattern
    
    for (let i = 0; i < n; i++) {
        while (j > 0 && pattern[j] !== text[i]) {
            j = f[j - 1]
        }
        
        if (pattern[j] === text[i]) {
            j++
        }
        
        if (j === m) {
            // Found a match at position i - m + 1
            positions.push(i - m + 1)
            j = f[j - 1]
        }
    }
    
    return positions
}

/**
 * Find all occurrences using KMP, returning a generator for memory efficiency.
 * Useful for very large texts where we don't want to store all positions at once.
 * @param {string} text - The text to search in
 * @param {string} pattern - The pattern to search for
 * @yields {number} - Starting positions where pattern occurs
 */
export function* kmpFindAllIterator(text, pattern) {
    if (!pattern || pattern.length === 0) {
        return
    }
    
    const n = text.length
    const m = pattern.length
    
    if (m > n) {
        return
    }
    
    const failure = buildFailureFunction(pattern)
    let j = 0
    
    for (let i = 0; i < n; i++) {
        while (j > 0 && pattern[j] !== text[i]) {
            j = failure[j - 1]
        }
        
        if (pattern[j] === text[i]) {
            j++
        }
        
        if (j === m) {
            yield i - m + 1
            j = failure[j - 1]
        }
    }
}

/**
 * Count occurrences of pattern in text without storing positions.
 * Memory efficient for cases where only count is needed.
 * @param {string} text - The text to search in
 * @param {string} pattern - The pattern to search for
 * @returns {number} - Number of occurrences
 */
export function kmpCount(text, pattern) {
    if (!pattern || pattern.length === 0) {
        return 0
    }
    
    const n = text.length
    const m = pattern.length
    
    if (m > n) {
        return 0
    }
    
    const failure = buildFailureFunction(pattern)
    let count = 0
    let j = 0
    
    for (let i = 0; i < n; i++) {
        while (j > 0 && pattern[j] !== text[i]) {
            j = failure[j - 1]
        }
        
        if (pattern[j] === text[i]) {
            j++
        }
        
        if (j === m) {
            count++
            j = failure[j - 1]
        }
    }
    
    return count
}

/**
 * Find positions in chunks to manage memory for very large datasets.
 * Processes text in batches and yields positions.
 * @param {string} text - The text to search in
 * @param {string} pattern - The pattern to search for
 * @param {number} [chunkSize=10000] - Maximum positions to collect per batch
 * @yields {number[]} - Arrays of positions in batches
 */
export function* kmpFindInChunks(text, pattern, chunkSize = 10000) {
    if (!pattern || pattern.length === 0) {
        return
    }
    
    const n = text.length
    const m = pattern.length
    
    if (m > n) {
        return
    }
    
    const failure = buildFailureFunction(pattern)
    let chunk = []
    let j = 0
    
    for (let i = 0; i < n; i++) {
        while (j > 0 && pattern[j] !== text[i]) {
            j = failure[j - 1]
        }
        
        if (pattern[j] === text[i]) {
            j++
        }
        
        if (j === m) {
            chunk.push(i - m + 1)
            j = failure[j - 1]
            
            if (chunk.length >= chunkSize) {
                yield chunk
                chunk = []
            }
        }
    }
    
    if (chunk.length > 0) {
        yield chunk
    }
}

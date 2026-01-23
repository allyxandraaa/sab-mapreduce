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
    
    let j = 0
    
    for (let i = 0; i < n; i++) {
        while (j > 0 && pattern[j] !== text[i]) {
            j = f[j - 1]
        }
        
        if (pattern[j] === text[i]) {
            j++
        }
        
        if (j === m) {
            positions.push(i - m + 1)
            j = f[j - 1]
        }
    }
    
    return positions
}


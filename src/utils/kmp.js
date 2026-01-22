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

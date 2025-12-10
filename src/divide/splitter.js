export function divideIntoSplits(buffer, config) {
    const splits = []
    const bufferLength = buffer.length
    const splitSize = Math.floor(bufferLength / config.numWorkers)
    const tail = config.windowSize - 1
    
    for (let i = 0; i < config.numWorkers; i++) {
        const start = i * splitSize
        let end = Math.min(start + splitSize, bufferLength)
        
        if (i === config.numWorkers - 1) {
            end = bufferLength
        }
        
        const tailedEnd = Math.min(end + tail, bufferLength)
        
        splits.push({
            start: start,
            end: end,
            tailedEnd: tailedEnd,
            index: i,
            length: end - start
        })
    }
    
    return splits
}

export function createSplitView(sharedBuffer, split) {
    const length = split.tailedEnd ? (split.tailedEnd - split.start) : split.length
    return new Uint8Array(sharedBuffer, split.start, length)
}

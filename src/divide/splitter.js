export function divideIntoSplits(view, config = {}) {
    if (!view || !config) {
        return []
    }

    const totalLength = view.length || 0
    const numWorkers = Math.max(1, config.numWorkers || 1)
    const tailLength = Math.max(config.tailLength || config.windowSize || 0, 0)

    if (totalLength === 0) {
        return Array.from({ length: numWorkers }, (_, index) => ({
            index,
            start: 0,
            end: 0,
            length: 0,
            tailedEnd: 0
        }))
    }

    const splits = []

    for (let index = 0; index < numWorkers; index++) {
        const start = Math.floor((index * totalLength) / numWorkers)
        const end = Math.floor(((index + 1) * totalLength) / numWorkers)
        const tailedEnd = Math.min(end + tailLength, totalLength)

        splits.push({
            index,
            start,
            end,
            length: Math.max(0, end - start),
            tailedEnd
        })
    }

    return splits
}

export function createSplitView(sharedBuffer, split = {}) {
    if (!sharedBuffer || typeof sharedBuffer.byteLength !== 'number') {
        return new Uint8Array()
    }

    const start = Math.max(0, split.start || 0)
    const end = Math.max(start, split.tailedEnd || split.end || start)
    const clampedEnd = Math.min(end, sharedBuffer.byteLength)
    const length = Math.max(0, clampedEnd - start)

    return new Uint8Array(sharedBuffer, start, length)
}
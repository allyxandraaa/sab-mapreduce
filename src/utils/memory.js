export function calculateMemoryLimit({ fileSize = 0, numWorkers = 1 } = {}) {
    const safeWorkers = Math.max(1, numWorkers)
    const sizePerWorker = Math.max(1, Math.floor(fileSize / safeWorkers))
    const baseLimit = Math.floor(sizePerWorker / 6)
    const normalizedLimit = Math.max(500, baseLimit)
    return Math.min(normalizedLimit, 200000)
}

export function calculateOptimalWorkers(fileSize, memoryLimit) {
    const minWorkers = 2
    const maxWorkers = 8
    const workers = Math.ceil(fileSize / (memoryLimit * 0.5))
    return Math.max(minWorkers, Math.min(maxWorkers, workers))
}

export function canFitInMemory(fileSize, memoryLimit) {
    return fileSize <= memoryLimit
}

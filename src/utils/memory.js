import os from 'os'

export function calculateMemoryLimit({ fileSize = 0, numWorkers = null } = {}) {
    if (fileSize <= 0) {
        return 2048
    }

    const cpuCount = os.cpus().length
    const numExecutors = numWorkers || Math.max(1, cpuCount - 1)
    
    const totalMemoryBytes = os.totalmem()
    const freeMemoryBytes = os.freemem()
    
    const memoryReserveFactor = 0.7
    const availableMemoryBytes = Math.min(freeMemoryBytes, totalMemoryBytes * memoryReserveFactor)
    
    const memoryPerExecutor = availableMemoryBytes / numExecutors
    
    const SUFFIX_ARRAY_BYTES = 4
    const LCP_ARRAY_BYTES = 4
    const SUFFIX_POSITION_BYTES = 4
    const TRIE_NODE_OVERHEAD = 48
    const BYTES_PER_SUFFIX_NODE = SUFFIX_ARRAY_BYTES + LCP_ARRAY_BYTES + SUFFIX_POSITION_BYTES + TRIE_NODE_OVERHEAD
    
    const FM = Math.floor(memoryPerExecutor / BYTES_PER_SUFFIX_NODE)
    
    const MIN_FM = 1000
    const MAX_FM = 50000
    
    const memoryLimit = Math.max(MIN_FM, Math.min(FM, MAX_FM))
    
    console.log('[Memory] ERa-based FM calculation:', {
        fileSize,
        numExecutors,
        totalMemoryMB: (totalMemoryBytes / (1024 * 1024)).toFixed(2),
        freeMemoryMB: (freeMemoryBytes / (1024 * 1024)).toFixed(2),
        availableMemoryMB: (availableMemoryBytes / (1024 * 1024)).toFixed(2),
        memoryPerExecutorMB: (memoryPerExecutor / (1024 * 1024)).toFixed(2),
        bytesPerSuffixNode: BYTES_PER_SUFFIX_NODE,
        calculatedFM: FM,
        memoryLimit
    })
    
    return memoryLimit
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

export class DGSTConfig {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 1
        this.memoryLimit = options.memoryLimit || null
        this.numWorkers = options.numWorkers || 4
        this.minSplitSize = options.minSplitSize || 1024
        this.maxSplitSize = options.maxSplitSize || 1024 * 1024 * 10
        this.maxSubTreeSize = options.maxSubTreeSize || 1000
    }
    
    async initialize(fileSize = 0) {
        const { calculateMemoryLimit } = await import('../utils/memory.js')

        this.numWorkers = Math.max(1, this.numWorkers)

        if (this.memoryLimit === null) {
            this.memoryLimit = calculateMemoryLimit({ fileSize, numWorkers: this.numWorkers })
        } else {
            this.memoryLimit = Math.max(100, this.memoryLimit)
        }

        const effectiveLimit = Math.max(1, this.memoryLimit)
        const splitSize = Math.max(1, Math.floor(effectiveLimit / (this.numWorkers * 2)))
        this.maxSplitSize = Math.min(this.maxSplitSize, splitSize)
        this.minSplitSize = Math.min(this.minSplitSize, Math.max(1, this.maxSplitSize / 4))
    }
}


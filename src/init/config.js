export class DGSTConfig {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 1
        this.memoryLimit = options.memoryLimit || null
        this.numWorkers = options.numWorkers || 4
        this.minSplitSize = options.minSplitSize || 1024
        this.maxSplitSize = options.maxSplitSize || 1024 * 1024 * 10
        this.maxSubTreeSize = options.maxSubTreeSize || 1000
    }
    
    async initialize() {
        const { calculateMemoryLimit } = await import('../utils/memory.js')
        
        this.numWorkers = Math.max(1, this.numWorkers)
        
        if (this.memoryLimit === null) {
            this.memoryLimit = calculateMemoryLimit(this.numWorkers)
        }
        
        const splitSize = Math.floor(this.memoryLimit / (this.numWorkers * 2))
        this.maxSplitSize = Math.min(this.maxSplitSize, splitSize)
        this.minSplitSize = Math.min(this.minSplitSize, this.maxSplitSize / 4)
    }
}


import { calculateMemoryLimit } from '../utils/memory.js'

export class DGSTConfig {
    constructor(options = {}) {
        this.windowSize = options.windowSize || 1
        this.windowStepSize = options.windowStepSize || 1
        this.numWorkers = Math.max(1, options.numWorkers || 4)
        this.memoryLimit = options.memoryLimit || null
        this.maxSubTreeSize = options.maxSubTreeSize || 1000
        this.tailLength = options.tailLength || null
        this.useFrequencyTrie = options.useFrequencyTrie !== false
        this.useUTS = options.useUTS !== false
        this.alphabetSize = options.alphabetSize || 256
    }

    async initialize(fileSize = 0) {
        this.memoryLimit = this.memoryLimit === null
            ? calculateMemoryLimit({ fileSize, numWorkers: this.numWorkers })
            : Math.max(100, this.memoryLimit)

        if (!this.tailLength) {
            const ratio = fileSize > 0 && this.memoryLimit > 0 ? fileSize / this.memoryLimit : 1
            const estimated = ratio <= 1 ? 1 : Math.ceil(Math.log(ratio) / Math.log(this.alphabetSize))
            this.tailLength = Math.max(this.windowSize, estimated)
        }
    }
}

export function calculateMaxPrefixLength(textLength, frequencyLimit, alphabetSize = 256) {
    if (frequencyLimit <= 0 || textLength <= 0) return 1
    const ratio = textLength / frequencyLimit
    if (ratio <= 1) return 1
    return Math.ceil(Math.log(ratio) / Math.log(alphabetSize))
}

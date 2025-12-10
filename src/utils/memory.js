export function calculateMemoryLimit() {
    const memoryLimit = navigator.deviceMemory || 4
    
    let Fm
    
    if (memoryLimit <= 2) {
        Fm = 30
    } else if (memoryLimit <= 4) {
        Fm = 50
    } else {
        Fm = 70
    }
    
    return Fm
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

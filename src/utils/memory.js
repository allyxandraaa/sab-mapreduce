import os from 'os'
import { logger } from './logger.js'

export function calculateMemoryLimit({ fileSize = 0, numWorkers = null } = {}) {
    if (fileSize <= 0) {
        return 2048
    }

    const cpuCount = os.cpus().length
    const numExecutors = numWorkers || Math.max(1, cpuCount - 1)
    
    const totalMemoryBytes = os.totalmem()
    const freeMemoryBytes = os.freemem()
    
    // Резервуємо 70% доступної пам'яті для обробки
    const memoryReserveFactor = 0.7
    const availableMemoryBytes = Math.min(freeMemoryBytes, totalMemoryBytes * memoryReserveFactor)
    
    // Пам'ять на воркер (область обробки ~40% від доступної)
    const memoryPerExecutor = (availableMemoryBytes / numExecutors) * 0.4
    
    const BYTES_PER_SUFFIX_IN_PROCESSING = 20
    
    // FM на основі пам'яті обробки
    const rawFM = Math.floor(memoryPerExecutor / BYTES_PER_SUFFIX_IN_PROCESSING)
    const MIN_FM = 50000  // Базовий мінімум для швидкої обробки
    
    // FM пропорційний розміру файлу - більші файли потребують вищий FM
    // щоб зменшити кількість префіксів
    const targetFM = Math.max(MIN_FM, Math.floor(fileSize / 50))
    
    // Обмежуємо доступною пам'яттю
    const memoryLimit = Math.min(rawFM, targetFM)
    
    console.log('Memory', 'розрахунок FM:', {
        rawFM: rawFM,
        targetFM: targetFM,
        memoryLimit: memoryLimit
    })
    
    return memoryLimit
}

/**
 * Розрахунок оптимальної кількості воркерів на основі розміру файлу.
 */
export function calculateOptimalWorkers(fileSize, memoryLimit) {
    const minWorkers = 2
    const maxWorkers = 8
    const workers = Math.ceil(fileSize / (memoryLimit * 0.5))
    return Math.max(minWorkers, Math.min(maxWorkers, workers))
}

/**
 * Перевірка чи файл поміститься в пам'яті.
 */
export function canFitInMemory(fileSize, memoryLimit) {
    return fileSize <= memoryLimit
}

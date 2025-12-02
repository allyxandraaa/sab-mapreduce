// Shuffle and Sort фаза MapReduce

// Рекурсивна функція для збору всіх пар [key, value] з результатів
function collectPairs(arr, targetArray) {
    arr.forEach(item => {
        if (Array.isArray(item)) {
            if (item.length === 2 && !Array.isArray(item[0]) && !Array.isArray(item[1])) {
                // Це пара [key, value] - додаємо
                targetArray.push(item)
            } else {
                // Це вкладений масив - рекурсивно обробляємо
                collectPairs(item, targetArray)
            }
        } else if (typeof item === 'object' && item !== null) {
            // Це об'єкт {key: value} - конвертуємо в пари
            Object.entries(item).forEach(([key, value]) => {
                // Просто додаємо пару [key, value] - групування обробить значення пізніше
                targetArray.push([key, value])
            })
        }
    })
}

// Групує значення за ключами та розподіляє між воркерами
function groupAndDistribute(allPairs, numWorkers) {
    if (allPairs.length === 0) {
        return Array(numWorkers).fill(null).map(() => ({}))
    }

    // Сортуємо за ключами
    allPairs.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

    // Групуємо значення за ключами
    const grouped = {}
    allPairs.forEach(([key, value]) => {
        const keyStr = String(key)
        if (!grouped[keyStr]) grouped[keyStr] = []
        grouped[keyStr].push(value)
    })

    // Розподіляємо між воркерами (простий хеш)
    const distributed = Array(numWorkers).fill(null).map(() => ({}))
    Object.entries(grouped).forEach(([key, values]) => {
        const hash = String(key).split('').reduce((h, c) => h + c.charCodeAt(0), 0)
        distributed[hash % numWorkers][key] = values
    })

    return distributed
}

// Streaming Shuffle: збирає дані по мірі надходження
export class StreamingShuffle {
    constructor(numWorkers) {
        this.numWorkers = numWorkers
        this.allPairs = []
        this.receivedResults = 0
        this.totalWorkers = 0
    }

    // Додає результати від одного воркера
    addResult(result) {
        if (!Array.isArray(result)) {
            return
        }
        
        collectPairs(result, this.allPairs)
        this.receivedResults++
    }

    // Виконує фінальне сортування, групування та розподіл
    finalize() {
        return groupAndDistribute(this.allPairs, this.numWorkers)
    }
}

// Shuffle and Sort phase: збирає, сортує, групує та розподіляє дані
export async function runShuffleAndSortPhase(mapWorkersWithResults, numWorkers) {
    // 1. Збираємо всі пари [key, value] від всіх Map-воркерів
    const allPairs = []
    
    mapWorkersWithResults.forEach(({ result }) => {
        if (!Array.isArray(result)) {
            return
        }
        collectPairs(result, allPairs)
    })

    // 2. Групуємо та розподіляємо
    return groupAndDistribute(allPairs, numWorkers)
}


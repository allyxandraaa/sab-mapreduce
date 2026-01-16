export function allocateTaskGroups(sPrefixes, memoryLimit, numWorkers) {
    if (!Array.isArray(sPrefixes) || sPrefixes.length === 0) {
        return { groups: [], rounds: [] }
    }

    const sorted = [...sPrefixes].sort((a, b) => b.frequency - a.frequency)
    const effectiveCapacity = Math.max(memoryLimit || 1, 1)

    const minGroupCount = Math.max(1, estimateGroupCount(sorted, effectiveCapacity))
    const workers = Math.max(1, numWorkers)

    let targetGroupCount = minGroupCount
    if (minGroupCount >= workers) {
        const alignedGroups = Math.ceil(minGroupCount / workers) * workers
        targetGroupCount = Math.max(workers, alignedGroups)
    }

    const balancedGroups = buildBalancedGroups(sorted, effectiveCapacity, targetGroupCount)
    const rounds = []
    for (let i = 0; i < balancedGroups.length; i += Math.max(1, numWorkers)) {
        rounds.push(balancedGroups.slice(i, i + numWorkers))
    }

    return {
        groups: balancedGroups,
        rounds
    }
}

// best-fit bin-packing алгоритм
function estimateGroupCount(prefixes, capacity) {
    const bins = []
    prefixes.forEach((prefix) => {
        const freq = prefix.frequency || 0
        let bestIndex = -1
        let smallestRemaining = Infinity

        for (let i = 0; i < bins.length; i++) {
            const remaining = capacity - bins[i]
            if (remaining >= freq && remaining < smallestRemaining) {
                smallestRemaining = remaining
                bestIndex = i
            }
        }

        if (bestIndex === -1) {
            bins.push(freq)
        } else {
            bins[bestIndex] += freq
        }
    })

    return bins.length || 1
}

// жадібний number partitioning алгоритм
function buildBalancedGroups(prefixes, capacity, targetGroupCount) {
    const groups = Array.from({ length: targetGroupCount }, (_, index) => ({
        id: index,
        prefixes: [],
        totalFrequency: 0
    }))

    prefixes.forEach((prefix) => {
        const freq = prefix.frequency || 0
        const groupIndex = findBestGroup(groups, freq, capacity)
        if (groupIndex === -1) {
            throw new Error('Неможливо розподілити префікс у межах memoryLimit. Збільште ліміт або зменшіть кількість воркерів.')
        }

        groups[groupIndex].prefixes.push(prefix)
        groups[groupIndex].totalFrequency += freq
    })

    return groups
}

function findBestGroup(groups, freq, capacity) {
    let bestIndex = -1
    let minLoad = Infinity

    for (let i = 0; i < groups.length; i++) {
        const group = groups[i]
        if (group.totalFrequency + freq <= capacity) {
            if (group.totalFrequency < minLoad) {
                minLoad = group.totalFrequency
                bestIndex = i
            }
        }
    }

    return bestIndex
}

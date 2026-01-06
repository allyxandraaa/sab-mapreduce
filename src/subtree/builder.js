import { allocateTaskGroups } from './allocation.js'

export async function buildSubTrees({ sharedBuffer, sPrefixes, config, executeRound }) {
    if (!sharedBuffer || !Array.isArray(sPrefixes) || sPrefixes.length === 0) {
        return {
            groups: [],
            rounds: [],
            subTrees: []
        }
    }

    if (typeof executeRound !== 'function') {
        throw new Error('Відсутній виконавець раундів піддерев (executeRound)')
    }

    const memoryLimit = config?.memoryLimit || 1024
    const numWorkers = Math.max(1, config?.numWorkers)

    const { groups, rounds } = allocateTaskGroups(sPrefixes, memoryLimit, numWorkers)
    const subTrees = []

    for (const round of rounds) {
        const roundResults = await executeRound(round)
        roundResults.forEach(result => {
            if (result && result.trees) {
                subTrees.push(result)
            }
        })
    }

    return {
        groups,
        rounds,
        subTrees
    }
}

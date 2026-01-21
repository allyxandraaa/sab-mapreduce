import { allocateTaskGroups } from './allocation.js'

export async function buildSubTrees({ sharedBuffer, sPrefixes, config, executeRound }) {
    if (!sharedBuffer || !Array.isArray(sPrefixes) || sPrefixes.length === 0) {
        return {
            groups: [],
            rounds: [],
            subTrees: [],
            suffixSubtrees: []
        }
    }

    if (typeof executeRound !== 'function') {
        throw new Error('Відсутній виконавець раундів піддерев (executeRound)')
    }

    const memoryLimit = config?.memoryLimit || 1024
    const numWorkers = Math.max(1, config?.numWorkers)

    console.info('[SubTree] Старт побудови піддерев:', sPrefixes.length, 'префіксів')

    const { groups, rounds } = allocateTaskGroups(sPrefixes, memoryLimit, numWorkers)

    console.info('[SubTree] Розподіл:', groups.length, 'груп,', rounds.length, 'раундів')

    const subTrees = []
    const suffixSubtrees = []

    for (let index = 0; index < rounds.length; index++) {
        const round = rounds[index]
        const groupIds = round.map(group => group?.id)
        console.info(`[SubTree] Раунд ${index + 1}/${rounds.length}...`)

        let roundResults
        try {
            roundResults = await executeRound(round)
        } catch (err) {
            console.error(`[SubTree] Помилка раунду ${index + 1}:`, err)
            throw err
        }

        roundResults.forEach(result => {
            if (!result) return
            subTrees.push(result)
            if (Array.isArray(result.suffixSubtrees)) {
                suffixSubtrees.push(...result.suffixSubtrees)
            }
        })
    }

    console.info('[SubTree] Завершено:', suffixSubtrees.length, 'піддерев')

    return {
        groups,
        rounds,
        subTrees,
        suffixSubtrees
    }
}

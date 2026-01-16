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

    console.info('[SubTree] Старт побудови піддерев', {
        prefixes: sPrefixes.length,
        memoryLimit,
        numWorkers
    })

    const { groups, rounds } = allocateTaskGroups(sPrefixes, memoryLimit, numWorkers)

    console.info('[SubTree] Результат розподілу груп', {
        groupCount: groups.length,
        roundCount: rounds.length,
        avgPrefixesPerGroup: groups.length ? (sPrefixes.length / groups.length).toFixed(2) : 0
    })

    if (groups.length) {
        console.info('[SubTree] Деталі груп', groups.map((group, index) => ({
            order: index + 1,
            groupId: group.id,
            prefixCount: group.prefixes.length,
            totalFrequency: group.totalFrequency,
            prefixes: group.prefixes.map(prefix => ({
                prefix: prefix.prefix,
                frequency: prefix.frequency,
                length: prefix.length
            }))
        })))
    }

    if (rounds.length) {
        console.info('[SubTree] Розклад раундів', rounds.map((round, roundIndex) => ({
            round: roundIndex + 1,
            groupIds: round.map(group => group?.id),
            prefixesPerGroup: round.map(group => group?.prefixes?.length || 0)
        })))
    }

    const subTrees = []
    const suffixSubtrees = []

    for (let index = 0; index < rounds.length; index++) {
        const round = rounds[index]
        const groupIds = round.map(group => group?.id)
        console.info(`[SubTree] Виконуємо раунд ${index + 1}/${rounds.length}`, {
            groupsInRound: round.length,
            groupIds
        })

        const roundResults = await executeRound(round)

        console.info(`[SubTree] Завершено раунд ${index + 1}/${rounds.length}`, {
            receivedResults: roundResults.length,
            nullResults: roundResults.filter(res => !res).length
        })

        roundResults.forEach(result => {
            if (!result) {
                return
            }
            console.info('[SubTree] Отримано результат групи', {
                groupId: result.groupId,
                suffixTreeCount: result.treeCount,
                totalFrequency: result.totalFrequency
            })
            subTrees.push(result)
            if (Array.isArray(result.suffixSubtrees)) {
                suffixSubtrees.push(...result.suffixSubtrees)
            }
        })
    }

    console.info('[SubTree] Побудову піддерев завершено', {
        totalSubTrees: subTrees.length,
        totalSuffixSubtrees: suffixSubtrees.length
    })

    return {
        groups,
        rounds,
        subTrees,
        suffixSubtrees
    }
}

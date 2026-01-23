import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { DGSTConfig } from '../init/config.js'
import { divideIntoSplits } from '../divide/splitter.js'
import { buildSubTrees } from '../subtree/builder.js'
import { processIteratively } from './iterative.js'
import { calculateBoundaries, populateSharedBuffer } from '../init/uts.js'
import { WorkerPool } from '../workers/worker-pool.js'
import { logger } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function buildDGST(files, options = {}) {
    logger.log('DGST Engine', 'Починаємо побудову для файлів:', files.map(f => f.name))
    logger.log('DGST Engine', 'Файли завантажено:', files.map(f => `${f.name} (${f.data.length} байт)`))

    const boundaries = calculateBoundaries(files)
    let workerPool = null
    
    const encoder = new TextEncoder()
    const separatorBytes = encoder.encode('\uE000')
    const terminatorBytes = encoder.encode('\uE001')
    const totalSeparatorBytes = files.length > 1 ? separatorBytes.length * (files.length - 1) : 0
    const totalSize = files.reduce((sum, f) => sum + f.data.length, 0) + totalSeparatorBytes + terminatorBytes.length
    const sharedBuffer = new SharedArrayBuffer(totalSize)
    
    populateSharedBuffer(files, sharedBuffer)

    logger.log('DGST Engine', 'Створено спільний буфер SharedArrayBuffer:', {
        totalSize: sharedBuffer.byteLength,
        boundaries: boundaries.length
    })

    const config = new DGSTConfig({
        numWorkers: options.numWorkers ?? 4,
        memoryLimit: options.memoryLimit ?? null,
        tailLength: options.tailLength ?? null
    })

    await config.initialize(totalSize)

    logger.log('DGST Engine', 'Конфігурацію ініціалізовано:', {
        numWorkers: config.numWorkers,
        memoryLimit: config.memoryLimit,
        tailLength: config.tailLength
    })

    const view = new Uint8Array(sharedBuffer)
    const splits = divideIntoSplits(view, config)
    logger.log('DGST Engine', 'Створено сплітів:', splits.length)

    workerPool = new WorkerPool(config.numWorkers)
    logger.log('DGST Engine', `Пул воркерів створено: ${config.numWorkers} воркерів`)

    const iterativeResult = await processIteratively(splits, config, {
        executeMapRound: (splitBatch) => runMapRoundWithPool(splitBatch, sharedBuffer, config, workerPool),
        executeReduceRound: (partitions) => runReduceRoundWithPool(partitions, config, workerPool)
    })

    const allSPrefixes = iterativeResult.prefixes
    const finalWindowSize = iterativeResult.finalWindowSize

    logger.log('DGST Engine', 'S-префікси обчислено:', allSPrefixes.length)

    const subTreeResult = await buildSubTrees({
        sharedBuffer,
        sPrefixes: allSPrefixes,
        config,
        executeRound: (round) => runSubTreeRoundWithPool(round, sharedBuffer, boundaries, config, workerPool)
    })

    await workerPool.terminate()
    logger.log('DGST Engine', 'Пул воркерів завершено')

    logger.log('DGST Engine', 'Піддерева побудовано:', {
        groups: subTreeResult.groups.length,
        subTrees: subTreeResult.subTrees.length
    })

    const builderStats = subTreeResult.stats || {}
    const suffixSubtrees = subTreeResult.suffixSubtrees || []
    
    let aggregatedTreeStats
    if (builderStats.totalSuffixCount !== undefined) {
        aggregatedTreeStats = {
            totalNodes: builderStats.totalNodeCount || 0,
            totalEdges: builderStats.totalEdgeCount || 0,
            maxDepth: 0,
            totalSuffixes: builderStats.totalSuffixCount || 0
        }
    } else {
        aggregatedTreeStats = suffixSubtrees.reduce((acc, tree) => {
            if (!tree) return acc
            
            const nodeCount = tree.nodeCount || (Array.isArray(tree?.nodes) ? tree.nodes.length : 0)
            const edgeCount = tree.edgeCount || (Array.isArray(tree?.edges) ? tree.edges.length : 0)
            const treeDepth = Array.isArray(tree?.nodes) && tree.nodes.length
                ? tree.nodes.reduce((max, node) => Math.max(max, node?.depth ?? 0), 0)
                : 0
            const suffixCount = typeof tree?.suffixCount === 'number' ? tree.suffixCount : 0

            acc.totalNodes += nodeCount
            acc.totalEdges += edgeCount
            acc.maxDepth = Math.max(acc.maxDepth, treeDepth)
            acc.totalSuffixes += suffixCount
            return acc
        }, { totalNodes: 0, totalEdges: 0, maxDepth: 0, totalSuffixes: 0 })
    }

    return {
        stats: {
            totalNodes: aggregatedTreeStats.totalNodes,
            totalEdges: aggregatedTreeStats.totalEdges,
            maxDepth: aggregatedTreeStats.maxDepth,
            totalSuffixes: aggregatedTreeStats.totalSuffixes,
            sPrefixes: allSPrefixes.length,
            memoryLimit: config.memoryLimit,
            finalWindowSize: finalWindowSize
        },
        groups: subTreeResult.groups,
        subTrees: subTreeResult.subTrees,
        boundaries
    }
}

function runMapRoundWithPool(splitBatch, sharedBuffer, config, pool) {
    logger.log('Map', `Виконуємо фазу Map для ${splitBatch.length} сплітів`)

    const promises = splitBatch.map((split, i) => {
        return pool.execute({
            phase: 'divide',
            sharedBuffer,
            split,
            windowSize: config.windowSize
        })
    })

    return Promise.all(promises)
}

function runReduceRoundWithPool(partitions, config, pool) {
    logger.log('Reduce', `Виконуємо фазу Reduce для ${partitions.length} партицій`)

    const promises = partitions.map((partition, i) => {
        return pool.execute({
            phase: 'reduce',
            partition,
            partitionIndex: i
        })
    })

    return Promise.all(promises)
}

function runSubTreeRoundWithPool(round, sharedBuffer, boundaries, config, pool) {
    logger.log('SubTree', `Виконуємо раунд побудови піддерев для ${round.length} груп`)

    const promises = round.map((group, i) => {
        logger.log('SubTree', `Відправляємо завдання для групи ${group.id} (${group.prefixes?.length || 0} префіксів)`)
        return pool.execute({
            phase: 'subtree',
            sharedBuffer,
            group,
            boundaries,
            useFrequencyTrie: true
        })
    })

    return Promise.all(promises)
}

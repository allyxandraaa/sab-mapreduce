import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { DGSTConfig } from '../init/config.js'
import { divideIntoSplits } from '../divide/splitter.js'
import { buildSubTrees } from '../subtree/builder.js'
import { processIteratively } from './iterative.js'
import { calculateBoundaries, populateSharedBuffer } from '../init/uts.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function buildDGST(files, options = {}) {
    console.log('[DGST Engine] Starting build for files:', files.map(f => f.name))
    console.log('[DGST Engine] Files loaded:', files.map(f => `${f.name} (${f.data.length} bytes)`))

    const boundaries = calculateBoundaries(files)
    
    const encoder = new TextEncoder()
    const separatorBytes = encoder.encode('\uE000')
    const terminatorBytes = encoder.encode('\uE001')
    const totalSeparatorBytes = files.length > 1 ? separatorBytes.length * (files.length - 1) : 0
    const totalSize = files.reduce((sum, f) => sum + f.data.length, 0) + totalSeparatorBytes + terminatorBytes.length
    const sharedBuffer = new SharedArrayBuffer(totalSize)
    
    populateSharedBuffer(files, sharedBuffer)

    console.log('[DGST Engine] SharedArrayBuffer created:', {
        totalSize: sharedBuffer.byteLength,
        boundaries: boundaries.length
    })

    const config = new DGSTConfig({
        numWorkers: options.numWorkers || 4,
        memoryLimit: options.memoryLimit || 2048,
        tailLength: options.tailLength || 100
    })

    console.log('[DGST Engine] Config initialized:', {
        numWorkers: config.numWorkers,
        memoryLimit: config.memoryLimit
    })

    const view = new Uint8Array(sharedBuffer)
    const splits = divideIntoSplits(view, config)
    console.log('[DGST Engine] Splits created:', splits.length)

    const allSPrefixes = await processIteratively(splits, config, {
        executeMapRound: (splitBatch) => runMapRoundNode(splitBatch, sharedBuffer, config),
        executeReduceRound: (partitions) => runReduceRoundNode(partitions, config)
    })

    console.log('[DGST Engine] S-Prefixes computed:', allSPrefixes.length)
    console.log('[DGST Engine] Початок побудови піддерев...')

    let subTreeResult
    try {
        subTreeResult = await buildSubTrees({
            sharedBuffer,
            sPrefixes: allSPrefixes,
            config,
            executeRound: (round) => runSubTreeRoundNode(round, sharedBuffer, boundaries, config)
        })
        console.log('[DGST Engine] buildSubTrees завершено')
    } catch (err) {
        console.error('[DGST Engine] Помилка buildSubTrees:', err)
        throw err
    }

    console.log('[DGST Engine] SubTrees built:', {
        groups: subTreeResult?.groups?.length || 0,
        subTrees: subTreeResult?.subTrees?.length || 0
    })

    const suffixSubtrees = subTreeResult.suffixSubtrees || []
    const aggregatedTreeStats = suffixSubtrees.reduce((acc, tree) => {
        if (!tree) return acc
        
        const nodeCount = Array.isArray(tree?.nodes) ? tree.nodes.length : 0
        const edgeCount = Array.isArray(tree?.edges) ? tree.edges.length : 0
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

    return {
        stats: {
            totalNodes: aggregatedTreeStats.totalNodes,
            totalEdges: aggregatedTreeStats.totalEdges,
            maxDepth: aggregatedTreeStats.maxDepth,
            totalSuffixes: aggregatedTreeStats.totalSuffixes,
            sPrefixes: allSPrefixes.length,
            memoryLimit: config.memoryLimit
        },
        groups: subTreeResult.groups,
        subTrees: subTreeResult.subTrees,
        boundaries
    }
}

function runMapRoundNode(splitBatch, sharedBuffer, config) {
    const workerPath = join(__dirname, 'worker-node.js')
    const promises = []

    for (let i = 0; i < splitBatch.length; i++) {
        const split = splitBatch[i]
        const promise = new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: { workerId: i }
            })

            worker.on('message', (msg) => {
                if (msg.type === 'success') {
                    worker.terminate()
                    resolve(msg.result)
                } else if (msg.type === 'error') {
                    console.error('[DGST Map] Помилка воркера', i, ':', msg.error)
                    worker.terminate()
                    reject(new Error(msg.error))
                }
            })

            worker.on('error', (err) => {
                console.error('[DGST Map] Аварійне завершення воркера', i, ':', err?.message)
                worker.terminate()
                reject(err)
            })

            worker.postMessage({
                phase: 'divide',
                sharedBuffer,
                split,
                windowSize: config.windowSize
            })
        })

        promises.push(promise)
    }

    return Promise.all(promises)
}

function runReduceRoundNode(partitions, config) {
    const workerPath = join(__dirname, 'worker-node.js')
    const promises = []

    for (let i = 0; i < partitions.length; i++) {
        const partition = partitions[i]
        const promise = new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: { workerId: i }
            })

            worker.on('message', (msg) => {
                if (msg.type === 'success') {
                    worker.terminate()
                    resolve(msg.result)
                } else if (msg.type === 'error') {
                    console.error('[DGST Reduce] Помилка воркера', i, ':', msg.error)
                    worker.terminate()
                    reject(new Error(msg.error))
                }
            })

            worker.on('error', (err) => {
                console.error('[DGST Reduce] Аварійне завершення воркера', i, ':', err?.message)
                worker.terminate()
                reject(err)
            })

            worker.postMessage({
                phase: 'reduce',
                partition,
                partitionIndex: i
            })
        })

        promises.push(promise)
    }

    return Promise.all(promises)
}

function runSubTreeRoundNode(round, sharedBuffer, boundaries, config) {
    const workerPath = join(__dirname, 'worker-node.js')
    const promises = []

    for (let i = 0; i < round.length; i++) {
        const group = round[i]
        const promise = new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
                workerData: { workerId: i }
            })

            worker.on('message', (msg) => {
                if (msg.type === 'success') {
                    worker.terminate()
                    resolve(msg.result)
                } else if (msg.type === 'error') {
                    console.error('[DGST SubTree] Помилка воркера', i, 'група', group?.id, ':', msg.error)
                    worker.terminate()
                    reject(new Error(msg.error))
                }
            })

            worker.on('error', (err) => {
                console.error('[DGST SubTree] Аварійне завершення воркера', i, 'група', group?.id, ':', err?.message)
                worker.terminate()
                reject(err)
            })

            worker.postMessage({
                phase: 'subtree',
                sharedBuffer,
                group,
                boundaries,
                useFrequencyTrie: true
            })
        })

        promises.push(promise)
    }

    return Promise.all(promises)
}

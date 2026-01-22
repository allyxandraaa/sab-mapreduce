import { writeFile, readFile, mkdir, rm, access } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'

const TREE_DIR_PREFIX = 'dgst_trees_'
let currentStorageDir = null

export async function initTreeStorage(sessionId = null) {
    const id = sessionId || Date.now().toString(36) + Math.random().toString(36).slice(2)
    currentStorageDir = join(tmpdir(), `${TREE_DIR_PREFIX}${id}`)
    
    try {
        await mkdir(currentStorageDir, { recursive: true })
    } catch (err) {
        if (err.code !== 'EEXIST') {
            throw err
        }
    }
    
    return currentStorageDir
}

async function getStorageDir() {
    if (!currentStorageDir) {
        return initTreeStorage()
    }
    return currentStorageDir
}

function prefixToFilename(prefix) {
    const hash = createHash('md5').update(prefix).digest('hex').slice(0, 12)
    const sanitized = prefix
        .slice(0, 20)
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
    return `tree_${sanitized}_${hash}.json`
}

function compressTreeData(tree) {
    
    return {
        p: tree.prefix,                       
        w: tree.windowLength,                 
        sc: tree.suffixCount,                 
        sa: tree.suffixArray,                 
        lcp: tree.lcpArray,                   
        ns: tree.nodes?.length || 0,          
        es: tree.edges?.length || 0           
    }
}

function decompressTreeData(compressed) {
    return {
        prefix: compressed.p,
        windowLength: compressed.w,
        suffixCount: compressed.sc,
        suffixArray: compressed.sa,
        lcpArray: compressed.lcp,
        nodes: [], 
        edges: [],
        _nodeCount: compressed.ns,
        _edgeCount: compressed.es
    }
}

export async function saveTree(tree, options = {}) {
    const { compress = true } = options
    const storageDir = await getStorageDir()
    const filename = prefixToFilename(tree.prefix)
    const filepath = join(storageDir, filename)
    
    const dataToStore = compress ? compressTreeData(tree) : tree
    
    await writeFile(filepath, JSON.stringify(dataToStore), 'utf8')
    
    return {
        type: 'disk_ref',
        path: filepath,
        prefix: tree.prefix,
        windowLength: tree.windowLength,
        suffixCount: tree.suffixCount,
        nodeCount: tree.nodes?.length || dataToStore.ns || 0,
        edgeCount: tree.edges?.length || dataToStore.es || 0
    }
}

export async function loadTree(ref, options = {}) {
    const { compressed = true } = options
    const filepath = typeof ref === 'string' ? ref : ref.path
    
    const data = await readFile(filepath, 'utf8')
    const parsed = JSON.parse(data)
    
    return compressed ? decompressTreeData(parsed) : parsed
}

export async function saveTreeBatch(trees, options = {}) {
    const refs = []
    
    for (const tree of trees) {
        if (!tree || !tree.prefix) continue
        const ref = await saveTree(tree, options)
        refs.push(ref)
    }
    
    return refs
}

export async function cleanupTreeStorage(dirPath = null) {
    const targetDir = dirPath || currentStorageDir
    
    if (!targetDir) return
    
    try {
        await access(targetDir)
        await rm(targetDir, { recursive: true, force: true })
    } catch (err) {
    }
    
    if (targetDir === currentStorageDir) {
        currentStorageDir = null
    }
}

export async function getStorageStats() {
    if (!currentStorageDir) {
        return { active: false, path: null, fileCount: 0 }
    }
    
    try {
        const { readdir, stat } = await import('fs/promises')
        const files = await readdir(currentStorageDir)
        
        let totalSize = 0
        for (const file of files) {
            const fileStat = await stat(join(currentStorageDir, file))
            totalSize += fileStat.size
        }
        
        return {
            active: true,
            path: currentStorageDir,
            fileCount: files.length,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
        }
    } catch {
        return { active: false, path: currentStorageDir, fileCount: 0 }
    }
}

export function createTreeStatsRef(treeStats) {
    return {
        type: 'stats_only',
        prefix: treeStats.prefix,
        windowLength: treeStats.windowLength,
        suffixCount: treeStats.suffixCount,
        nodeCount: treeStats.nodeCount || 0,
        edgeCount: treeStats.edgeCount || 0
    }
}

export { currentStorageDir }

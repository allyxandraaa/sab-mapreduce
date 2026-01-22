/**
 * Disk-based tree storage for memory-efficient suffix tree management.
 * Trees are serialized to JSON files instead of being kept in memory.
 */

import { writeFile, readFile, mkdir, rm, access } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { tmpdir } from 'os'

const TREE_DIR_PREFIX = 'dgst_trees_'
let currentStorageDir = null

/**
 * Initialize tree storage directory
 * @param {string} [sessionId] - Optional session ID for unique directory
 * @returns {Promise<string>} - Path to storage directory
 */
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

/**
 * Get or create the storage directory
 * @returns {Promise<string>}
 */
async function getStorageDir() {
    if (!currentStorageDir) {
        return initTreeStorage()
    }
    return currentStorageDir
}

/**
 * Generate a safe filename from a prefix
 * @param {string} prefix - The prefix string
 * @returns {string} - Safe filename
 */
function prefixToFilename(prefix) {
    // Hash the prefix to create a safe filename
    const hash = createHash('md5').update(prefix).digest('hex').slice(0, 12)
    // Also include sanitized prefix chars for readability
    const sanitized = prefix
        .slice(0, 20)
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
    return `tree_${sanitized}_${hash}.json`
}

/**
 * Compress tree data for storage by removing redundant information
 * @param {Object} tree - Full tree object
 * @returns {Object} - Compressed tree data
 */
function compressTreeData(tree) {
    // Store only essential data, compute rest on load
    return {
        p: tree.prefix,                        // prefix
        w: tree.windowLength,                  // windowLength
        sc: tree.suffixCount,                  // suffixCount
        sa: tree.suffixArray,                  // suffixArray (positions needed)
        lcp: tree.lcpArray,                    // lcpArray (needed for tree structure)
        // Skip nodes/edges - they can be reconstructed if needed, or store compact version
        ns: tree.nodes?.length || 0,           // node count (for stats)
        es: tree.edges?.length || 0            // edge count (for stats)
    }
}

/**
 * Decompress tree data after loading
 * @param {Object} compressed - Compressed tree data
 * @returns {Object} - Full tree object
 */
function decompressTreeData(compressed) {
    return {
        prefix: compressed.p,
        windowLength: compressed.w,
        suffixCount: compressed.sc,
        suffixArray: compressed.sa,
        lcpArray: compressed.lcp,
        nodes: [], // Can be reconstructed if needed
        edges: [], // Can be reconstructed if needed
        _nodeCount: compressed.ns,
        _edgeCount: compressed.es
    }
}

/**
 * Save a suffix tree to disk
 * @param {Object} tree - Tree object with prefix, suffixArray, etc.
 * @param {Object} [options] - Options
 * @param {boolean} [options.compress=true] - Whether to compress data
 * @returns {Promise<Object>} - Reference object with path and metadata
 */
export async function saveTree(tree, options = {}) {
    const { compress = true } = options
    const storageDir = await getStorageDir()
    const filename = prefixToFilename(tree.prefix)
    const filepath = join(storageDir, filename)
    
    const dataToStore = compress ? compressTreeData(tree) : tree
    
    await writeFile(filepath, JSON.stringify(dataToStore), 'utf8')
    
    // Return a lightweight reference instead of the full tree
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

/**
 * Load a suffix tree from disk
 * @param {Object|string} ref - Reference object or filepath
 * @param {Object} [options] - Options
 * @param {boolean} [options.compressed=true] - Whether data is compressed
 * @returns {Promise<Object>} - Full tree object
 */
export async function loadTree(ref, options = {}) {
    const { compressed = true } = options
    const filepath = typeof ref === 'string' ? ref : ref.path
    
    const data = await readFile(filepath, 'utf8')
    const parsed = JSON.parse(data)
    
    return compressed ? decompressTreeData(parsed) : parsed
}

/**
 * Save multiple trees in batch
 * @param {Object[]} trees - Array of tree objects
 * @param {Object} [options] - Options
 * @returns {Promise<Object[]>} - Array of references
 */
export async function saveTreeBatch(trees, options = {}) {
    const refs = []
    
    for (const tree of trees) {
        if (!tree || !tree.prefix) continue
        const ref = await saveTree(tree, options)
        refs.push(ref)
    }
    
    return refs
}

/**
 * Clean up tree storage
 * @param {string} [dirPath] - Specific directory to clean, or current storage dir
 * @returns {Promise<void>}
 */
export async function cleanupTreeStorage(dirPath = null) {
    const targetDir = dirPath || currentStorageDir
    
    if (!targetDir) return
    
    try {
        await access(targetDir)
        await rm(targetDir, { recursive: true, force: true })
    } catch (err) {
        // Directory doesn't exist or already removed
    }
    
    if (targetDir === currentStorageDir) {
        currentStorageDir = null
    }
}

/**
 * Get storage statistics
 * @returns {Promise<Object>} - Storage stats
 */
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

/**
 * Create a tree reference without full data (for streaming results)
 * @param {Object} treeStats - Basic tree statistics
 * @returns {Object} - Minimal reference
 */
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

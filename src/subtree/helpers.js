import { buildSuffixArrayWithLCPRange } from './lcpRange.js'
import { logger } from '../utils/logger.js'
import { kmpFindAll } from '../utils/kmp.js'

const decoder = new TextDecoder('utf-8')

export function buildGroupSubTrees(textOrView, group, options = {}) {
    const text = typeof textOrView === 'string' ? textOrView : decoder.decode(textOrView)
    if (!group || !Array.isArray(group.prefixes)) {
        return { suffixSubtrees: [] }
    }

    logger.log('SubTree', `Обробка групи ${group.id}: ${group.prefixes.length} префіксів`)

    const boundaries = options.boundaries || []
    const suffixSubtrees = []
    
    for (let idx = 0; idx < group.prefixes.length; idx++) {
        const prefixInfo = group.prefixes[idx]
        
        if (idx % 100 === 0 && idx > 0) {
            logger.log('SubTree', `Група ${group.id}: оброблено ${idx}/${group.prefixes.length} префіксів`)
        }
        
        const tree = buildSubTreeForPrefix(text, prefixInfo, boundaries)
        suffixSubtrees.push(tree)
    }

    logger.log('SubTree', `Група ${group.id} завершена: побудовано ${suffixSubtrees.length} піддерев`)

    return { suffixSubtrees }
}

export function buildSubTreeForPrefix(text, prefixInfo, boundaries = []) {
    const prefix = prefixInfo?.prefix || ''
    
    if (!prefix) {
        return {
            prefix: '',
            windowLength: 0,
            suffixCount: 0,
            suffixArray: [],
            lcpArray: [],
            nodes: [],
            edges: []
        }
    }

    const suffixPositions = collectSuffixPositionsKMP(text, prefix)
    
    if (suffixPositions.length === 0) {
        return {
            prefix,
            windowLength: prefix.length,
            suffixCount: 0,
            suffixArray: [],
            lcpArray: [],
            nodes: [],
            edges: []
        }
    }

    const MAX_POSITIONS = 10000
    const positionsToSort = suffixPositions.length > MAX_POSITIONS 
        ? suffixPositions.slice(0, MAX_POSITIONS)
        : suffixPositions
    
    // Побудова суфіксного масиву з LCP-діапазонами
    const { suffixArray, lcpRanges } = buildSuffixArrayWithLCPRange(text, positionsToSort, 32)
    const lcpArray = lcpRanges.map(lcpRange => lcpRange.offset)
    
    if (suffixArray.length > 1000) {
        logger.log('SubTree', `Префікс "${prefix.slice(0, 10)}...": suffix array побудовано, будуємо структуру дерева...`)
    }
    
    const { nodes, edges } = buildSuffixTreeStructure(text, suffixArray, lcpArray, boundaries)

    if (suffixArray.length > 1000) {
        logger.log('SubTree', `Префікс "${prefix.slice(0, 10)}...": дерево побудовано (${nodes.length} вузлів, ${edges.length} ребер)`)
    }

    return {
        prefix,
        windowLength: prefix.length,
        suffixCount: suffixPositions.length,
        suffixArray,
        lcpArray,
        nodes,
        edges
    }
}

export function decodeSharedBuffer(sharedBuffer) {
    if (!sharedBuffer) {
        return new Uint8Array(0)
    }
    return new Uint8Array(sharedBuffer)
}

function collectSuffixPositions(text, prefix) {
    const positions = []
    if (!prefix) return positions

    let index = 0
    while (index < text.length) {
        const foundIndex = text.indexOf(prefix, index)
        if (foundIndex === -1) break
        positions.push(foundIndex)
        index = foundIndex + 1
    }
    return positions
}

function collectSuffixPositionsKMP(text, prefix) {
    if (!prefix) return []
    return kmpFindAll(text, prefix)
}

function buildSuffixTreeStructure(text, suffixArray, lcpArray, boundaries = []) {
    if (suffixArray.length === 0) {
        return { nodes: [], edges: [] }
    }

    const findStringMapping = boundaries.length === 0 ? () => null : (globalIndex) => {
        let lo = 0, hi = boundaries.length - 1
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1
            const boundary = boundaries[mid]
            if (globalIndex < boundary.start) {
                hi = mid - 1
            } else if (globalIndex >= boundary.end) {
                lo = mid + 1
            } else {
                return {
                    stringId: boundary.index,
                    stringName: boundary.name,
                    localIndex: globalIndex - boundary.start
                }
            }
        }
        return null
    }

    const nodes = [{ id: 0, depth: 0, type: 'root' }]
    const edges = []
    let nextNodeId = 1

    const stack = [{ nodeId: 0, depth: 0, lastChildId: -1 }]

    for (let i = 0; i < suffixArray.length; i++) {
        const suffixStart = suffixArray[i]
        const lcp = i === 0 ? 0 : lcpArray[i]
        
        while (stack.length > 1 && stack[stack.length - 1].depth > lcp) {
            stack.pop()
        }
        
        if (stack.length > 0 && stack[stack.length - 1].depth < lcp) {
            const internalId = nextNodeId++
            const parentStackItem = stack[stack.length - 1]
            const lastChildId = parentStackItem.lastChildId
            
            nodes.push({ id: internalId, depth: lcp, type: 'internal' })
            
            if (lastChildId !== -1) {
                const edgeToModify = edges.find(e => e.to === lastChildId && e.from === parentStackItem.nodeId)
                if (edgeToModify) {
                    const prevSuffixStart = suffixArray[i - 1]
                    const parentDepth = parentStackItem.depth
                    
                    const newEnd = edgeToModify.start + (lcp - parentDepth)
                    edgeToModify.to = internalId
                    edgeToModify.end = newEnd
                    edgeToModify.labelPreview = text.slice(edgeToModify.start, Math.min(newEnd, edgeToModify.start + 32))
                    
                    edges.push({
                        from: internalId,
                        to: lastChildId,
                        start: newEnd,
                        end: text.length,
                        labelPreview: text.slice(newEnd, Math.min(text.length, newEnd + 32))
                    })
                }
            }
            
            parentStackItem.lastChildId = internalId
            stack.push({ nodeId: internalId, depth: lcp, lastChildId: -1 })
        }
        
        const leafId = nextNodeId++
        const leafData = { suffixStart }
        if (boundaries.length > 0) {
            const mapping = findStringMapping(suffixStart)
            if (mapping) {
                leafData.stringId = mapping.stringId
                leafData.stringName = mapping.stringName
                leafData.localIndex = mapping.localIndex
            }
        }
        
        const leafDepth = text.length - suffixStart
        nodes.push({ 
            id: leafId, 
            depth: leafDepth, 
            type: 'leaf', 
            ...leafData
        })
        
        const parentStackItem = stack[stack.length - 1]
        const parentNode = parentStackItem.nodeId
        const parentDepth = parentStackItem.depth
        
        edges.push({
            from: parentNode,
            to: leafId,
            start: suffixStart + parentDepth,
            end: text.length,
            labelPreview: text.slice(suffixStart + parentDepth, Math.min(text.length, suffixStart + parentDepth + 32))
        })
        
        stack[stack.length - 1].lastChildId = leafId
    }

    return { nodes, edges }
}

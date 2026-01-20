import { buildSuffixArrayWithLCPRange } from './lcpRange.js'

const decoder = new TextDecoder('utf-8')

export function buildGroupSubTrees(text, group, options = {}) {
    if (!group || !Array.isArray(group.prefixes)) {
        return {
            suffixSubtrees: []
        }
    }

    const boundaries = options.boundaries || []
    const suffixSubtrees = group.prefixes.map(prefixInfo => buildSubTreeForPrefix(text, prefixInfo, boundaries))

    return {
        suffixSubtrees
    }
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

    const suffixPositions = collectSuffixPositions(text, prefix)
    const { suffixArray, lcpRanges } = buildSuffixArrayWithLCPRange(text, suffixPositions, 32)
    const lcpArray = lcpRanges.map(lcpRange => lcpRange.offset)
    const { nodes, edges } = buildSuffixTreeStructure(text, suffixArray, lcpArray, boundaries)

    return {
        prefix,
        windowLength: prefix.length,
        suffixCount: suffixArray.length,
        suffixArray,
        lcpArray,
        nodes,
        edges
    }
}

export function decodeSharedBuffer(sharedBuffer) {
    const sharedView = new Uint8Array(sharedBuffer)
    const copy = new Uint8Array(sharedView.length)
    copy.set(sharedView)
    return decoder.decode(copy)
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
function buildSuffixTreeStructure(text, suffixArray, lcpArray, boundaries = []) {
    if (suffixArray.length === 0) {
        return { nodes: [], edges: [] }
    }

    const findStringMapping = (globalIndex) => {
        for (let i = 0; i < boundaries.length; i++) {
            const boundary = boundaries[i]
            if (globalIndex >= boundary.start && globalIndex < boundary.end) {
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

    const children = new Map()
    children.set(0, new Map())

    const getOrCreateChild = (parentId, parentDepth, char, targetDepth, suffixPos) => {
        const parentChildren = children.get(parentId)
        
        if (parentChildren.has(char)) {
            return parentChildren.get(char)
        }

        const nodeId = nextNodeId++
        const isLeaf = targetDepth === text.length - suffixPos
        const leafData = isLeaf ? { suffixStart: suffixPos } : {}
        if (isLeaf && boundaries.length > 0) {
            const mapping = findStringMapping(suffixPos)
            if (mapping) {
                leafData.stringId = mapping.stringId
                leafData.stringName = mapping.stringName
                leafData.localIndex = mapping.localIndex
            }
        }
        nodes.push({ 
            id: nodeId, 
            depth: targetDepth, 
            type: isLeaf ? 'leaf' : 'internal',
            ...leafData
        })
        
        edges.push({
            from: parentId,
            to: nodeId,
            start: suffixPos + parentDepth,
            end: suffixPos + targetDepth,
            labelPreview: text.slice(suffixPos + parentDepth, Math.min(suffixPos + targetDepth, suffixPos + parentDepth + 32))
        })
        
        parentChildren.set(char, { nodeId, depth: targetDepth })
        children.set(nodeId, new Map())
        
        return { nodeId, depth: targetDepth }
    }

    const splitEdge = (parentId, parentDepth, existingChild, splitDepth, suffixPos) => {
        const internalId = nextNodeId++
        nodes.push({ id: internalId, depth: splitDepth, type: 'internal' })
        children.set(internalId, new Map())

        const edgeIndex = edges.findIndex(e => e.from === parentId && e.to === existingChild.nodeId)
        if (edgeIndex !== -1) {
            const oldEdge = edges[edgeIndex]
            const oldStart = oldEdge.start
            
            oldEdge.to = internalId
            oldEdge.end = oldStart + (splitDepth - parentDepth)
            oldEdge.labelPreview = text.slice(oldEdge.start, Math.min(oldEdge.end, oldEdge.start + 32))

            const continueChar = text.charAt(oldStart + (splitDepth - parentDepth))
            children.get(internalId).set(continueChar, existingChild)

            edges.push({
                from: internalId,
                to: existingChild.nodeId,
                start: oldStart + (splitDepth - parentDepth),
                end: oldStart + (existingChild.depth - parentDepth),
                labelPreview: text.slice(oldStart + (splitDepth - parentDepth), Math.min(oldStart + (existingChild.depth - parentDepth), oldStart + (splitDepth - parentDepth) + 32))
            })
        }

        const parentChildren = children.get(parentId)
        const charToUpdate = text.charAt(suffixPos + parentDepth)
        parentChildren.set(charToUpdate, { nodeId: internalId, depth: splitDepth })

        return { nodeId: internalId, depth: splitDepth }
    }

    for (let i = 0; i < suffixArray.length; i++) {
        const suffixStart = suffixArray[i]
        const lcp = i === 0 ? 0 : lcpArray[i - 1]

        let currentNode = 0
        let currentDepth = 0

        while (currentDepth < lcp) {
            const char = text.charAt(suffixStart + currentDepth)
            const nodeChildren = children.get(currentNode)
            
            if (nodeChildren.has(char)) {
                const child = nodeChildren.get(char)
                if (child.depth <= lcp) {
                    currentNode = child.nodeId
                    currentDepth = child.depth
                } else {
                    const split = splitEdge(currentNode, currentDepth, child, lcp, suffixStart)
                    currentNode = split.nodeId
                    currentDepth = split.depth
                    break
                }
            } else {
                break
            }
        }

        const leafChar = text.charAt(suffixStart + currentDepth)
        const leafDepth = text.length - suffixStart
        const leafEnd = suffixStart + leafDepth
        
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
        nodes.push({ 
            id: leafId, 
            depth: leafDepth, 
            type: 'leaf', 
            ...leafData
        })
        
        edges.push({
            from: currentNode,
            to: leafId,
            start: suffixStart + currentDepth,
            end: text.length,
            labelPreview: text.slice(suffixStart + currentDepth, Math.min(text.length, suffixStart + currentDepth + 32))
        })
        
        children.get(currentNode).set(leafChar, { nodeId: leafId, depth: leafDepth })
        children.set(leafId, new Map())
    }

    return { nodes, edges }
}

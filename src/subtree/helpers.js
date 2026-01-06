const decoder = new TextDecoder('utf-8')

export function buildGroupSubTrees(text, group) {
    if (!group || !Array.isArray(group.prefixes)) {
        return []
    }
    return group.prefixes.map(prefixInfo => buildSubTreeForPrefix(text, prefixInfo))
}

export function buildSubTreeForPrefix(text, prefixInfo) {
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
    const suffixArray = buildSuffixArray(text, suffixPositions)
    const lcpArray = buildLcpArray(text, suffixArray)
    const { nodes, edges } = buildSuffixTreeStructure(text, suffixArray, lcpArray)

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
    const view = new Uint8Array(sharedBuffer)
    return decoder.decode(view)
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

function buildSuffixArray(text, positions) {
    const sorted = [...positions]
    sorted.sort((a, b) => compareSuffixes(text, a, b))
    return sorted
}

function compareSuffixes(text, posA, posB) {
    if (posA === posB) return 0
    const len = text.length
    let offset = 0
    while (posA + offset < len && posB + offset < len) {
        const charCodeA = text.charCodeAt(posA + offset)
        const charCodeB = text.charCodeAt(posB + offset)
        if (charCodeA !== charCodeB) {
            return charCodeA - charCodeB
        }
        offset++
    }
    return (len - posA) - (len - posB)
}

function buildLcpArray(text, suffixArray) {
    if (suffixArray.length <= 1) return []
    const lcps = []
    for (let i = 1; i < suffixArray.length; i++) {
        const prev = suffixArray[i - 1]
        const curr = suffixArray[i]
        lcps.push(computeLcp(text, prev, curr))
    }
    return lcps
}

function computeLcp(text, posA, posB) {
    const len = text.length
    let offset = 0
    while (posA + offset < len && posB + offset < len && text.charCodeAt(posA + offset) === text.charCodeAt(posB + offset)) {
        offset++
    }
    return offset
}

function buildSuffixTreeStructure(text, suffixArray, lcpArray) {
    if (suffixArray.length === 0) {
        return { nodes: [], edges: [] }
    }

    const nodes = [{ id: 0, depth: 0 }]
    const edges = []
    const stack = [{ nodeId: 0, depth: 0 }]

    const createEdge = (from, to, start, end) => {
        edges.push({
            from,
            to,
            start,
            end,
            labelPreview: text.slice(start, Math.min(end, start + 32))
        })
    }

    suffixArray.forEach((suffixStart, index) => {
        const lcp = index === 0 ? 0 : lcpArray[index - 1]

        while (stack.length > 0 && stack[stack.length - 1].depth > lcp) {
            stack.pop()
        }

        let top = stack[stack.length - 1]
        if (top.depth < lcp) {
            const internalId = nodes.length
            nodes.push({ id: internalId, depth: lcp })
            createEdge(top.nodeId, internalId, suffixStart + top.depth, suffixStart + lcp)
            top = { nodeId: internalId, depth: lcp }
            stack.push(top)
        }

        const leafDepth = text.length - suffixStart
        const leafId = nodes.length
        nodes.push({ id: leafId, depth: leafDepth, suffixStart })
        createEdge(top.nodeId, leafId, suffixStart + top.depth, text.length)
        stack.push({ nodeId: leafId, depth: leafDepth })
    })

    return { nodes, edges }
}

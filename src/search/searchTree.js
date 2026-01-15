const CONTEXT_RADIUS = 30
const WHITESPACE_REGEX = /\s/

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function charactersMatch(patternChar, textChar) {
    if (patternChar === textChar) {
        return true
    }

    const patternIsWhitespace = WHITESPACE_REGEX.test(patternChar)
    const textIsWhitespace = WHITESPACE_REGEX.test(textChar)

    return patternIsWhitespace && textIsWhitespace
}

function buildTreeIndex(tree) {
    const nodes = new Map()
    tree.nodes.forEach(node => {
        nodes.set(node.id, { ...node, children: [] })
    })

    const edges = Array.isArray(tree.edges) ? tree.edges : []
    edges.forEach(edge => {
        const parent = nodes.get(edge.from)
        if (parent) {
            parent.children.push({
                nodeId: edge.to,
                start: edge.start,
                end: edge.end
            })
        }
    })

    let root = nodes.get(0)
    if (!root) {
        root = Array.from(nodes.values()).find(node => node.type === 'root') || null
    }

    return { nodes, root }
}

function collectLeafPositions(startNode, nodes) {
    const positions = []
    const stack = [startNode]

    while (stack.length) {
        const node = stack.pop()
        if (!node) continue
        if (node.type === 'leaf' && Number.isInteger(node.suffixStart)) {
            positions.push(node.suffixStart)
        } else if (node.children) {
            node.children.forEach(child => {
                const next = nodes.get(child.nodeId)
                if (next) {
                    stack.push(next)
                }
            })
        }
    }

    return positions
}

function createSnippet(text, position, patternLength, radius = CONTEXT_RADIUS) {
    const start = Math.max(0, position - radius)
    const end = Math.min(text.length, position + patternLength + radius)

    const prefix = escapeHtml(text.slice(start, position))
    const match = escapeHtml(text.slice(position, position + patternLength))
    const suffix = escapeHtml(text.slice(position + patternLength, end))

    const ellipsisStart = start > 0 ? '…' : ''
    const ellipsisEnd = end < text.length ? '…' : ''

    return `${ellipsisStart}${prefix}<span class="highlight">${match}</span>${suffix}${ellipsisEnd}`
}

export function searchInSuffixTree(tree, pattern, options = {}) {
    const query = pattern?.trim()
    if (!query) return []
    if (!tree || !Array.isArray(tree.nodes) || tree.nodes.length === 0) return []

    const text = tree.text
    if (typeof text !== 'string' || text.length === 0) {
        return []
    }

    const { nodes, root } = buildTreeIndex(tree)
    if (!root) return []

    const lowerCase = options.caseSensitive ? false : true
    const normalizedQuery = lowerCase ? query.toLowerCase() : query
    const sourceText = lowerCase ? text.toLowerCase() : text

    let currentNode = root
    let i = 0

    while (i < normalizedQuery.length) {
        const currentChar = normalizedQuery[i]
        const child = currentNode.children?.find(child => {
            const edgeChar = sourceText.charAt(child.start)
            return charactersMatch(currentChar, edgeChar)
        })
        if (!child) {
            return []
        }

        const edgeLength = child.end - child.start
        for (let offset = 0; offset < edgeLength && i < normalizedQuery.length; offset++) {
            const edgeChar = sourceText.charAt(child.start + offset)
            const patternChar = normalizedQuery.charAt(i)
            if (!charactersMatch(patternChar, edgeChar)) {
                return []
            }
            i++
        }

        currentNode = nodes.get(child.nodeId)
        if (!currentNode) {
            return []
        }
    }

    const positions = collectLeafPositions(currentNode, nodes)
    const uniquePositions = Array.from(new Set(positions)).sort((a, b) => a - b)

    return uniquePositions.map(position => ({
        position,
        context: createSnippet(text, position, query.length, options.contextRadius)
    }))
}

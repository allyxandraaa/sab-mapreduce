export class FrequencyTrieNode {
    constructor() {
        this.children = new Map()
        this.frequency = 0
        this.isLeaf = false
    }
}

export class FrequencyTrie {
    constructor() {
        this.root = new FrequencyTrieNode()
    }

    insert(prefix, count = 1) {
        let node = this.root
        for (let i = 0; i < prefix.length; i++) {
            const char = prefix[i]
            if (!node.children.has(char)) {
                node.children.set(char, new FrequencyTrieNode())
            }
            node = node.children.get(char)
            node.frequency += count
        }
        node.isLeaf = true
    }

    getFrequency(prefix) {
        let node = this.root
        for (let i = 0; i < prefix.length; i++) {
            const char = prefix[i]
            if (!node.children.has(char)) {
                return 0
            }
            node = node.children.get(char)
        }
        return node.frequency
    }

    hasPrefix(prefix) {
        let node = this.root
        for (let i = 0; i < prefix.length; i++) {
            const char = prefix[i]
            if (!node.children.has(char)) {
                return false
            }
            node = node.children.get(char)
        }
        return true
    }

    getNode(prefix) {
        let node = this.root
        for (let i = 0; i < prefix.length; i++) {
            const char = prefix[i]
            if (!node.children.has(char)) {
                return null
            }
            node = node.children.get(char)
        }
        return node
    }

    collectPrefixes(maxDepth = Infinity) {
        const result = []
        this._collectRecursive(this.root, '', maxDepth, result)
        return result
    }

    _collectRecursive(node, currentPrefix, maxDepth, result) {
        if (currentPrefix.length > 0 && currentPrefix.length <= maxDepth) {
            if (node.isLeaf || node.children.size === 0) {
                result.push({
                    prefix: currentPrefix,
                    frequency: node.frequency,
                    length: currentPrefix.length
                })
                return
            }
        }

        if (currentPrefix.length >= maxDepth) {
            result.push({
                prefix: currentPrefix,
                frequency: node.frequency,
                length: currentPrefix.length
            })
            return
        }

        for (const [char, childNode] of node.children) {
            this._collectRecursive(childNode, currentPrefix + char, maxDepth, result)
        }
    }

    collectLeaves() {
        const result = []
        this._collectLeavesRecursive(this.root, '', result)
        return result
    }

    _collectLeavesRecursive(node, currentPrefix, result) {
        if (node.children.size === 0 && currentPrefix.length > 0) {
            result.push({
                prefix: currentPrefix,
                frequency: node.frequency,
                length: currentPrefix.length
            })
            return
        }

        for (const [char, childNode] of node.children) {
            this._collectLeavesRecursive(childNode, currentPrefix + char, result)
        }
    }

    merge(otherTrie) {
        this._mergeNodes(this.root, otherTrie.root)
    }

    _mergeNodes(targetNode, sourceNode) {
        for (const [char, sourceChild] of sourceNode.children) {
            if (!targetNode.children.has(char)) {
                targetNode.children.set(char, new FrequencyTrieNode())
            }
            const targetChild = targetNode.children.get(char)
            targetChild.frequency += sourceChild.frequency
            targetChild.isLeaf = targetChild.isLeaf || sourceChild.isLeaf
            this._mergeNodes(targetChild, sourceChild)
        }
    }

    partitionByFrequency(frequencyLimit, currentDepth) {
        const accepted = []
        const needsExtension = []
        this._partitionRecursive(this.root, '', frequencyLimit, currentDepth, accepted, needsExtension)
        return { accepted, needsExtension }
    }

    _partitionRecursive(node, currentPrefix, frequencyLimit, targetDepth, accepted, needsExtension) {
        if (currentPrefix.length === targetDepth) {
            if (node.frequency <= frequencyLimit) {
                accepted.push({
                    prefix: currentPrefix,
                    frequency: node.frequency,
                    length: currentPrefix.length
                })
            } else {
                needsExtension.push({
                    prefix: currentPrefix,
                    frequency: node.frequency,
                    length: currentPrefix.length
                })
            }
            return
        }

        if (currentPrefix.length > targetDepth) {
            return
        }

        for (const [char, childNode] of node.children) {
            this._partitionRecursive(childNode, currentPrefix + char, frequencyLimit, targetDepth, accepted, needsExtension)
        }
    }

    prune(frequencyLimit) {
        this._pruneRecursive(this.root, frequencyLimit)
    }

    _pruneRecursive(node, frequencyLimit) {
        const toRemove = []
        for (const [char, childNode] of node.children) {
            if (childNode.frequency <= frequencyLimit) {
                childNode.children.clear()
                childNode.isLeaf = true
            } else {
                this._pruneRecursive(childNode, frequencyLimit)
            }
        }
    }

    serialize() {
        return this._serializeNode(this.root)
    }

    _serializeNode(node) {
        const children = {}
        for (const [char, childNode] of node.children) {
            children[char] = this._serializeNode(childNode)
        }
        return {
            frequency: node.frequency,
            isLeaf: node.isLeaf,
            children
        }
    }

    static deserialize(data) {
        const trie = new FrequencyTrie()
        trie.root = FrequencyTrie._deserializeNode(data)
        return trie
    }

    static _deserializeNode(data) {
        const node = new FrequencyTrieNode()
        node.frequency = data.frequency || 0
        node.isLeaf = data.isLeaf || false
        for (const [char, childData] of Object.entries(data.children || {})) {
            node.children.set(char, FrequencyTrie._deserializeNode(childData))
        }
        return node
    }

    static buildFromText(text, windowSize, targetPrefixes = null, terminalSymbol = null) {
        const trie = new FrequencyTrie()
        const textLength = text.length

        for (let i = 0; i < textLength; i++) {
            if (i + windowSize > textLength) break

            const prefix = text.substring(i, i + windowSize)

            if (prefix.includes('\n') || prefix.includes('\r')) continue

            if (terminalSymbol && prefix.indexOf(terminalSymbol) !== -1 && 
                prefix.indexOf(terminalSymbol) < prefix.length - 1) {
                continue
            }

            if (targetPrefixes && targetPrefixes.size > 0) {
                let matches = false
                for (const target of targetPrefixes) {
                    if (prefix.startsWith(target)) {
                        matches = true
                        break
                    }
                }
                if (!matches) continue
            }

            trie.insert(prefix)
        }

        return trie
    }

    static collectSuffixPositionsWithTrie(text, prefix) {
        const positions = []
        if (!prefix) return positions

        const prefixLength = prefix.length
        const textLength = text.length

        for (let i = 0; i <= textLength - prefixLength; i++) {
            let matches = true
            for (let j = 0; j < prefixLength; j++) {
                if (text.charCodeAt(i + j) !== prefix.charCodeAt(j)) {
                    matches = false
                    break
                }
            }
            if (matches) {
                positions.push(i)
            }
        }

        return positions
    }
}

export function calculateMaxPrefixLength(textLength, frequencyLimit, alphabetSize = 256) {
    if (frequencyLimit <= 0 || textLength <= 0) return 1
    const ratio = textLength / frequencyLimit
    if (ratio <= 1) return 1
    return Math.ceil(Math.log(ratio) / Math.log(alphabetSize))
}

export function calculateTailLength(textLength, frequencyLimit, alphabetSize = 256) {
    return calculateMaxPrefixLength(textLength, frequencyLimit, alphabetSize)
}

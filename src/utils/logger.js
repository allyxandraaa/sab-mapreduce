class Logger {
    constructor() {
        this.enabledScopes = new Set()
        this.disableAll = false
    }

    enable(scope) {
        if (scope === '*') {
            this.enabledScopes.clear()
            this.disableAll = false
        } else {
            this.enabledScopes.add(scope)
        }
    }

    disable(scope) {
        if (scope === '*') {
            this.disableAll = true
            this.enabledScopes.clear()
        } else {
            this.enabledScopes.delete(scope)
        }
    }

    isEnabled(scope) {
        if (this.disableAll) return false
        if (this.enabledScopes.size === 0) return true
        return this.enabledScopes.has(scope)
    }

    log(scope, ...args) {
        if (!this.isEnabled(scope)) return
        console.log(`[${scope}]`, ...args)
    }

    info(scope, ...args) {
        if (!this.isEnabled(scope)) return
        console.info(`[${scope}]`, ...args)
    }

    error(scope, ...args) {
        if (!this.isEnabled(scope)) return
        console.error(`[${scope}]`, ...args)
    }

    warn(scope, ...args) {
        if (!this.isEnabled(scope)) return
        console.warn(`[${scope}]`, ...args)
    }
}

export const logger = new Logger()

logger.enabledScopes.clear()
logger.enable("SPrefix")

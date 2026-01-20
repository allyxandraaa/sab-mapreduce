const API_BASE_URL = 'http://localhost:3001/api'

export class DGSTApiClient {
    constructor(baseUrl = API_BASE_URL) {
        this.baseUrl = baseUrl
        this.currentJobId = null
    }

    async createJob(files, options = {}) {
        const formData = new FormData()
        
        files.forEach(file => {
            formData.append('files', file)
        })
        
        if (options.numWorkers) {
            formData.append('numWorkers', options.numWorkers)
        }
        if (options.memoryLimit) {
            formData.append('memoryLimit', options.memoryLimit)
        }
        if (options.tailLength) {
            formData.append('tailLength', options.tailLength)
        }

        const response = await fetch(`${this.baseUrl}/jobs`, {
            method: 'POST',
            body: formData
        })

        if (!response.ok) {
            throw new Error(`Failed to create job: ${response.statusText}`)
        }

        const result = await response.json()
        this.currentJobId = result.jobId
        return result
    }

    async getStatus(jobId = this.currentJobId) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        const response = await fetch(`${this.baseUrl}/jobs/${jobId}/status`)
        
        if (!response.ok) {
            throw new Error(`Failed to get status: ${response.statusText}`)
        }

        return response.json()
    }

    async getGroups(jobId = this.currentJobId) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        const response = await fetch(`${this.baseUrl}/jobs/${jobId}/groups`)
        
        if (!response.ok) {
            throw new Error(`Failed to get groups: ${response.statusText}`)
        }

        return response.json()
    }

    async getGroup(groupId, jobId = this.currentJobId) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        const response = await fetch(`${this.baseUrl}/jobs/${jobId}/groups/${groupId}`)
        
        if (!response.ok) {
            throw new Error(`Failed to get group: ${response.statusText}`)
        }

        return response.json()
    }

    async getSummary(jobId = this.currentJobId) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        const response = await fetch(`${this.baseUrl}/jobs/${jobId}/summary`)
        
        if (!response.ok) {
            throw new Error(`Failed to get summary: ${response.statusText}`)
        }

        return response.json()
    }

    async deleteJob(jobId = this.currentJobId) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
            method: 'DELETE'
        })
        
        if (!response.ok) {
            throw new Error(`Failed to delete job: ${response.statusText}`)
        }

        if (jobId === this.currentJobId) {
            this.currentJobId = null
        }

        return response.json()
    }

    async pollUntilComplete(jobId = this.currentJobId, onProgress = null, intervalMs = 2000) {
        if (!jobId) {
            throw new Error('No job ID provided')
        }

        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                try {
                    const status = await this.getStatus(jobId)
                    
                    if (onProgress) {
                        onProgress(status)
                    }

                    if (status.status === 'completed') {
                        clearInterval(interval)
                        resolve(status)
                    } else if (status.status === 'failed') {
                        clearInterval(interval)
                        reject(new Error(status.error || 'Job failed'))
                    }
                } catch (error) {
                    clearInterval(interval)
                    reject(error)
                }
            }, intervalMs)
        })
    }
}

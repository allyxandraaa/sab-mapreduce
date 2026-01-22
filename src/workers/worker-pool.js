import { Worker } from 'worker_threads'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class WorkerPool {
    constructor(size, workerScript = 'worker-node.js') {
        this.workerPath = join(__dirname, workerScript)
        this.workers = []
        this.nextWorkerIndex = 0
        
        for (let i = 0; i < size; i++) {
            const worker = new Worker(this.workerPath, {
                workerData: { workerId: i }
            })
            this.workers.push(worker)
        }
    }

    execute(message) {
        return new Promise((resolve, reject) => {
            const worker = this.workers[this.nextWorkerIndex]
            this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workers.length

            const onMessage = (msg) => {
                worker.off('message', onMessage)
                worker.off('error', onError)

                if (msg.type === 'success') {
                    resolve(msg.result)
                } else if (msg.type === 'error') {
                    reject(new Error(msg.error || 'Worker error'))
                }
            }

            const onError = (err) => {
                worker.off('message', onMessage)
                worker.off('error', onError)
                reject(err)
            }

            worker.once('message', onMessage)
            worker.once('error', onError)
            worker.postMessage(message)
        })
    }

    async terminate() {
        for (const worker of this.workers) {
            await worker.terminate()
        }
    }
}

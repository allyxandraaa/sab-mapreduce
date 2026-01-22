import express from 'express'
import multer from 'multer'
import { randomUUID } from 'crypto'
import { buildDGST } from './dgst-engine.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const upload = multer({ storage: multer.memoryStorage() })

const jobs = new Map()

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200)
    }
    next()
})

app.use(express.json())
app.use(express.static(join(__dirname, '../../public')))
app.use('/src', express.static(join(__dirname, '../../src')))

app.post('/api/jobs', upload.array('files'), async (req, res) => {
    try {
        const jobId = randomUUID()
        const uploadedFiles = req.files.map(f => ({
            name: f.originalname || f.fieldname || 'upload.txt',
            data: f.buffer
        }))
        
        const options = {
            numWorkers: parseInt(req.body.numWorkers, 10) || 4,
            memoryLimit: req.body.memoryLimit ? parseInt(req.body.memoryLimit, 10) : null,
            tailLength: req.body.tailLength ? parseInt(req.body.tailLength, 10) : null
        }

        console.log('[API] New job created:', jobId, 'files:', uploadedFiles.length)
        
        jobs.set(jobId, { 
            status: 'running', 
            progress: 0,
            startTime: Date.now()
        })
        
        buildDGST(uploadedFiles, options)
            .then(result => {
                const endTime = Date.now()
                jobs.set(jobId, { 
                    status: 'completed', 
                    result,
                    startTime: jobs.get(jobId).startTime,
                    endTime,
                    duration: (endTime - jobs.get(jobId).startTime) / 1000
                })
                console.log('[API] Job completed:', jobId)
            })
            .catch(err => {
                jobs.set(jobId, { 
                    status: 'failed', 
                    error: err.message,
                    stack: err.stack
                })
                console.error('[API] Job failed:', jobId, err)
            })
        
        res.json({ jobId, status: 'running' })
    } catch (error) {
        console.error('[API] Error creating job:', error)
        res.status(500).json({ error: error.message })
    }
})

app.get('/api/jobs/:jobId/status', (req, res) => {
    const job = jobs.get(req.params.jobId)
    
    if (!job) {
        return res.status(404).json({ status: 'not_found' })
    }
    
    const response = {
        status: job.status,
        progress: job.progress
    }
    
    if (job.status === 'completed') {
        response.stats = job.result.stats
        response.groupCount = job.result.groups.length
        response.duration = job.duration
    } else if (job.status === 'failed') {
        response.error = job.error
    }
    
    res.json(response)
})

app.get('/api/jobs/:jobId/groups', (req, res) => {
    const job = jobs.get(req.params.jobId)
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed yet' })
    }
    
    const groups = job.result.groups.map((group, idx) => ({
        displayIndex: idx + 1,
        groupId: group.id,
        totalFrequency: group.totalFrequency,
        prefixCount: group.prefixes.length
    }))
    
    res.json({ groups })
})

app.get('/api/jobs/:jobId/groups/:groupId', (req, res) => {
    const job = jobs.get(req.params.jobId)
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed yet' })
    }
    
    const groupId = parseInt(req.params.groupId)
    const group = job.result.groups.find(g => g.id === groupId)
    
    if (!group) {
        return res.status(404).json({ error: 'Group not found' })
    }
    
    const subTree = job.result.subTrees.find(st => st.groupId === groupId)
    
    res.json({
        displayIndex: job.result.groups.indexOf(group) + 1,
        groupId: group.id,
        totalFrequency: group.totalFrequency,
        suffixSubtrees: subTree?.suffixSubtrees || []
    })
})

app.get('/api/jobs/:jobId/summary', (req, res) => {
    const job = jobs.get(req.params.jobId)
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed yet' })
    }
    
    res.json({
        stats: job.result.stats,
        groupCount: job.result.groups.length,
        duration: job.duration,
        boundaries: job.result.boundaries
    })
})

app.delete('/api/jobs/:jobId', (req, res) => {
    const deleted = jobs.delete(req.params.jobId)
    
    if (deleted) {
        res.json({ message: 'Job deleted' })
    } else {
        res.status(404).json({ error: 'Job not found' })
    }
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
    console.log(`[API] DGST API server running on port ${PORT}`)
    console.log(`[API] Endpoints:`)
    console.log(`  POST   /api/jobs - Create new DGST job`)
    console.log(`  GET    /api/jobs/:jobId/status - Get job status`)
    console.log(`  GET    /api/jobs/:jobId/groups - List all groups`)
    console.log(`  GET    /api/jobs/:jobId/groups/:groupId - Get specific group`)
    console.log(`  GET    /api/jobs/:jobId/summary - Get job summary`)
    console.log(`  DELETE /api/jobs/:jobId - Delete job`)
})

export default app

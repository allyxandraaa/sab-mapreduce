import http from 'http'
import fs from 'fs'
import path from 'path'

const PORT = 8000

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.txt': 'text/plain'
}

const server = http.createServer((req, res) => {
    // Set required headers for SharedArrayBuffer
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')

    let filePath = '.' + req.url
    if (filePath === './') {
        filePath = './index.html'
    }

    const extname = String(path.extname(filePath)).toLowerCase()
    const contentType = mimeTypes[extname] || 'application/octet-stream'

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' })
                res.end('<h1>404 - File Not Found</h1>', 'utf-8')
            } else {
                res.writeHead(500)
                res.end(`Server Error: ${error.code}`, 'utf-8')
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(content, 'utf-8')
        }
    })
})

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`)
    console.log('Press Ctrl+C to stop the server')
})
export function getFile() {
    const fileInput = document.getElementById('file-input')
    return fileInput.files[0]
}

export async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(file)
    })
}

export async function readFilesAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(file)
    })
}

export async function readBlobAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
}

export async function copyFileToBuffer(file, targetView, offset = 0, options = {}) {
    if (!file || !targetView) {
        return 0
    }

    const chunkSize = Math.max(options.chunkSize || 2 * 1024 * 1024, 64 * 1024)
    const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null
    let written = 0

    while (written < file.size) {
        const sliceEnd = Math.min(written + chunkSize, file.size)
        const blobSlice = file.slice(written, sliceEnd)
        const chunkBuffer = await readBlobAsArrayBuffer(blobSlice)
        const chunkView = new Uint8Array(chunkBuffer)
        targetView.set(chunkView, offset + written)
        if (onChunk) {
            onChunk(chunkView)
        }
        written += chunkView.length
    }

    return written
}


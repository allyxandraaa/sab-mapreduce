// Головний файл - імпортує всі модулі та ініціалізує додаток
import { readFilesAsText } from './fileUtils.js'
import { displayFormattedText, displayCodeFile } from './ui.js'

// Ініціалізація UI event listeners
document.addEventListener('DOMContentLoaded', function () {
    const fileInput = document.getElementById('file-input')
    const mapFileInput = document.getElementById('map-function-file')
    const reduceFileInput = document.getElementById('reduce-function-file')
    const mapPreview = document.getElementById('map-function-preview')
    const reducePreview = document.getElementById('reduce-function-preview')
    const fileContent = document.getElementById('file-content')

    fileInput.addEventListener('change', async function () {
        if (this.files[0]) {
            try {
                const text = await readFilesAsText(this.files[0])
                displayFormattedText(text, fileContent)
            } catch (error) {
                console.error("Помилка при читанні:", error)
                displayFormattedText(`Error: ${error.message}`, fileContent)
            }
        }
    })

    mapFileInput.addEventListener('change', function () {
        displayCodeFile(this.files[0], mapPreview)
    })

    reduceFileInput.addEventListener('change', function () {
        displayCodeFile(this.files[0], reducePreview)
    })
})

import { initializeMapReduce } from './mapReduce.js'
window.initializeMapReduce = initializeMapReduce


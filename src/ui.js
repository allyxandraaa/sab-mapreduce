// UI функції для відображення контенту
import { readFilesAsText } from './fileUtils.js'

// Функція для форматування тексту в стилізованому блоці
export function displayFormattedText(text, element) {
    const wrapper = document.createElement('div')
    wrapper.className = 'code-preview'
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = text
    pre.appendChild(code)
    wrapper.appendChild(pre)
    element.innerHTML = ''
    element.appendChild(wrapper)
}

// Функція для відображення коду з файлу
export async function displayCodeFile(file, previewElement) {
    if (!file) return

    try {
        const content = await readFilesAsText(file)
        displayFormattedText(content, previewElement)
    } catch (error) {
        previewElement.textContent = `Error loading file: ${error.message}`
    }
}



// Утиліти для безпечного розподілу чанків (не розрізає UTF-8 символи та слова)

// Перевіряє, чи байт є початком UTF-8 символу
function isUtf8Start(byte) {
    // UTF-8 символи починаються з:
    // 0xxxxxxx (ASCII) або
    // 110xxxxx (2 байти) або
    // 1110xxxx (3 байти) або
    // 11110xxx (4 байти)
    // Продовження байтів: 10xxxxxx
    // Перевіряємо, чи починається байт з 10, перевіряючи перші два біти
    return (byte & 0xC0) !== 0x80
}

// Знаходить найближчий безпечний байт (початок UTF-8 символу) назад від позиції
function findSafeBoundaryBackward(view, position, maxPosition) {
    let pos = Math.min(position, maxPosition - 1)
    // Перевіряємо до 4 байтів назад (максимальна довжина UTF-8 символу)
    for (let i = 0; i < 4 && pos >= 0; i++) {
        if (isUtf8Start(view[pos])) {
            return pos
        }
        pos--
    }
    // Якщо не знайшли, повертаємо початкову позицію
    return position
}

// Знаходить найближчий безпечний байт (початок UTF-8 символу) вперед від позиції
function findSafeBoundaryForward(view, position, maxPosition) {
    let pos = Math.min(position, maxPosition - 1)
    // Перевіряємо до 4 байтів вперед
    for (let i = 0; i < 4 && pos < maxPosition; i++) {
        if (isUtf8Start(view[pos])) {
            return pos
        }
        pos++
    }
    return position
}

// Знаходить межу слова (пробіл, перенос рядка, табуляція)
function findWordBoundary(view, position, maxPosition, direction = 'right') {
    const isWhitespace = (byte) => {
        // Пробіл (32), табуляція (9), перенос рядка (10), повернення каретки (13)
        return byte === 32 || byte === 9 || byte === 10 || byte === 13
    }
    
    if (direction === 'right') {
        // Шукаємо праворуч (вперед) до кінця слова (знаходимо пробіл після слова)
        let pos = position
        while (pos < maxPosition && !isWhitespace(view[pos])) {
            pos++
        }
        return pos
    } else {
        // Шукаємо ліворуч (назад) до пробілу перед словом
        // Якщо поточна позиція - це пробіл, повертаємо її
        let pos = position
        if (pos < maxPosition && isWhitespace(view[pos])) {
            return pos
        }
        // Шукаємо пробіл зліва
        while (pos > 0 && !isWhitespace(view[pos - 1])) {
            pos--
        }
        // Повертаємо позицію пробілу (або 0, якщо не знайшли)
        return pos > 0 ? pos - 1 : 0
    }
}

// Знаходить безпечну межу для кінця чанку (не розрізає UTF-8 символи та слова)
export function findSafeChunkEnd(sharedBuffer, targetEnd, maxPosition) {
    const view = new Uint8Array(sharedBuffer, 0, maxPosition)
    
    // Спочатку знаходимо безпечну UTF-8 межу (шукаємо назад)
    let safeEnd = findSafeBoundaryBackward(view, targetEnd, maxPosition)
    
    // Потім намагаємося знайти межу слова (не далі ніж на 100 байтів вперед)
    const wordBoundary = findWordBoundary(view, safeEnd, Math.min(safeEnd + 100, maxPosition), 'right')
    
    // Якщо межа слова недалеко, використовуємо її
    if (wordBoundary - safeEnd < 100) {
        safeEnd = wordBoundary
    }
    
    return safeEnd
}

// Знаходить безпечну межу для початку чанку (не розрізає UTF-8 символи та слова)
export function findSafeChunkStart(sharedBuffer, targetStart, maxPosition) {
    const view = new Uint8Array(sharedBuffer, 0, maxPosition)
    
    // Спочатку знаходимо безпечну UTF-8 межу (шукаємо вперед)
    let safeStart = findSafeBoundaryForward(view, targetStart, maxPosition)
    
    // Потім намагаємося знайти межу слова (не далі ніж на 100 байтів назад)
    const searchStart = Math.max(0, safeStart - 100)
    const wordBoundary = findWordBoundary(view, safeStart, maxPosition, 'left')
    
    // Якщо межа слова недалеко назад, використовуємо її
    if (safeStart - wordBoundary < 100 && wordBoundary >= searchStart) {
        safeStart = wordBoundary
    }
    
    return safeStart
}


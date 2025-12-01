# SharedArrayBuffer MapReduce Implementation

A parallel file processing system utilizing SharedArrayBuffer and Web Workers, implementing the MapReduce distributed computing paradigm for client-side data processing.

## Overview

This project demonstrates the application of SharedArrayBuffer for distributing large files across multiple Web Workers that perform parallel processing following the MapReduce algorithm. Each worker processes a designated portion of the file, resulting in significant performance improvements for large-scale data computations.

## Requirements

- Node.js version 14 or higher
- Modern web browser with SharedArrayBuffer support (Chrome, Edge, Firefox)

## Installation

No additional dependencies required. The project utilizes only built-in Node.js modules.

## Execution

Start the HTTP server:

```bash
node server.js
```

Access the application at `http://localhost:8000/`

Terminate the server with `Ctrl + C`.

## Usage

1. Select a `.txt` file for processing
2. Define the map function (JavaScript code)
3. Define the reduce function (JavaScript code)
4. Specify the number of worker threads (default: 4)
5. Click "Apply Map Reduce" to initiate processing

### Example 1: Simple Text Length Count

**Map Function:**
```javascript
const decoder = new TextDecoder('utf-8');
const text = decoder.decode(view);
return text.length;
```

**Reduce Function:**
```javascript
return acc + curr;
```

### Example 2: Word Count

**Map Function:**
```javascript
const decoder = new TextDecoder('utf-8');
const text = decoder.decode(view);
const words = text.split(/\s+/).filter(word => word.length > 0);
return words.reduce((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
}, {});
```

**Reduce Function:**
```javascript
Object.keys(curr).forEach(key => {
    acc[key] = (acc[key] || 0) + curr[key];
});
return acc;
```

## Server Requirement

SharedArrayBuffer requires specific HTTP security headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) to mitigate Spectre/Meltdown-type attacks. These headers cannot be set via the `file://` protocol, necessitating an HTTP server.

## Technical Architecture

**SharedArrayBuffer**: Enables shared memory between the main thread and Web Workers without data copying.

**Web Workers**: Execute processing operations in separate threads without blocking the UI.

**Typed Arrays (Uint8Array)**: Provide byte-level file manipulation and views into SharedArrayBuffer regions:
```javascript
const chunkView = new Uint8Array(sharedBuffer, startByte, lengthInBytes)
```

## Academic Context

Coursework project for the National University of Kyiv Mohyla Academy (NaUKMA).
/**
 * Dev-only mock of an OpenAI-compatible streaming chat endpoint (phase 3 E2E).
 * Usage: node scripts/mock-ai-server.mjs [port]
 * Streams three deltas then [DONE]; auth header is checked to prove the proxy
 * sends the key. NOT part of the product.
 */
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8787)
const KEY = 'sk-mock-test-key'

createServer((request, response) => {
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end()
    return
  }
  const auth = request.headers.authorization
  if (auth !== `Bearer ${KEY}`) {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'invalid api key' } }))
    return
  }
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const bodyChunks = []
  request.on('data', (chunk) => bodyChunks.push(chunk))
  request.on('end', () => {
    const body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8'))
    void body // the mock echoes the question regardless
    const deltas = ['这是', '一个', '模拟回答。']
    let index = 0
    const timer = setInterval(() => {
      if (index < deltas.length) {
        const text = deltas[index++]
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
      } else {
        response.write('data: [DONE]\n\n')
        response.end()
        clearInterval(timer)
      }
    }, 120)
  })
}).listen(PORT, () => {
  console.log(`mock ai server on http://localhost:${PORT}/v1/chat/completions (key: ${KEY})`)
})

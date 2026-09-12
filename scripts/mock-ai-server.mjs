/**
 * Dev-only mock of an OpenAI-compatible chat + embeddings server (phase 3 E2E).
 * Usage: node scripts/mock-ai-server.mjs [port]
 * - POST /v1/chat/completions: streams three deltas then [DONE]
 * - POST /v1/embeddings: deterministic bag-of-words hashing vectors (64 dims)
 *   so cosine retrieval ranks lexically-related chunks above unrelated ones.
 * Auth header is checked. NOT part of the product.
 */
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8787)
const KEY = 'sk-mock-test-key'

const DIMS = 64
// Hashing-trick embedding: token hashes accumulate into a normalized vector.
function embed(text) {
  const vector = new Array(DIMS).fill(0)
  for (const token of text.toLowerCase().match(/[\w\u4e00-\u9fff]+/g) ?? []) {
    let hash = 0
    for (const char of token) hash = (hash * 31 + char.codePointAt(0)) >>> 0
    vector[hash % DIMS] += 1
  }
  const norm = Math.hypot(...vector)
  return norm === 0 ? vector : vector.map((v) => v / norm)
}

createServer((request, response) => {
  if (
    request.method !== 'POST' ||
    (!request.url?.endsWith('/chat/completions') && !request.url?.endsWith('/embeddings'))
  ) {
    response.writeHead(404).end()
    return
  }
  const auth = request.headers.authorization
  if (auth !== `Bearer ${KEY}`) {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'invalid api key' } }))
    return
  }
  if (request.url.endsWith('/embeddings')) {
    const bodyChunks = []
    request.on('data', (chunk) => bodyChunks.push(chunk))
    request.on('end', () => {
      const body = JSON.parse(Buffer.concat(bodyChunks).toString('utf8'))
      const vectors = (body.input ?? []).map(embed)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ data: vectors.map((embedding, i) => ({ index: i, embedding })) }),
      )
    })
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
    const systemText = (body.messages ?? []).find((m) => m.role === 'system')?.content ?? ''
    if (systemText.includes('"overview"') || systemText.includes('"chapters"')) {
      // structured insight request: reply with valid JSON for zod validation
      const summary = {
        overview: '这是模拟摘要:小镇在化雪时节点灯候信的故事。',
        themes: ['等待', '灯', '信'],
        coverage: '基于章节开头,未覆盖全部正文',
      }
      const outline = {
        chapters: [
          { title: '第一章 灯', gist: '点灯迎信,雪水如信。' },
          { title: '第二章 信', gist: '信到之日,雪化灯明。' },
        ],
      }
      const payload = systemText.includes('"overview"')
        ? JSON.stringify(summary)
        : JSON.stringify(outline)
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\n`)
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }
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

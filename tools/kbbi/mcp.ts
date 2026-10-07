/**
 * Optional MCP adapter (T038, T039, R6, FR-012, FR-016).
 *
 * `kbbi-mcp-server` is a *cross-check* layer: sampling, word context, and
 * verifying that the bulk lexicon reader agrees with the reference server. It
 * is never the bulk path. `compare.ts` does not import this file, which is the
 * enforcement mechanism - bulk measurement is incapable of calling MCP even by
 * accident, so a missing or broken MCP server cannot move an accuracy number.
 *
 * When the server is not configured, `sample` fails with an explanation and the
 * snapshot path forward. It must never report a misleading figure (FR-016).
 */

import { spawn } from 'node:child_process'
import type { Capability, McpAvailability, McpSample } from './types.ts'

/** Environment variable naming a stdio MCP server command. */
export const MCP_COMMAND_ENV = 'KBBI_MCP_COMMAND'

/** Environment variable naming an HTTP MCP endpoint. */
export const MCP_URL_ENV = 'KBBI_MCP_URL'

/**
 * Probe for a configured server without contacting anything. Being explicit
 * about "absent" is what lets the bulk path stay silent about MCP entirely.
 */
export function probeMcp(env: NodeJS.ProcessEnv = process.env): McpAvailability {
  const url = env[MCP_URL_ENV]
  if (typeof url === 'string' && url.length > 0) {
    return { available: true, transport: 'http', reason: `endpoint dari ${MCP_URL_ENV}` }
  }
  const command = env[MCP_COMMAND_ENV]
  if (typeof command === 'string' && command.trim().length > 0) {
    return { available: true, transport: 'stdio', reason: `perintah dari ${MCP_COMMAND_ENV}` }
  }
  return {
    available: false,
    transport: 'none',
    reason:
      `Server MCP kbbi-mcp-server tidak dikonfigurasi. Set ${MCP_COMMAND_ENV} (stdio) atau ` +
      `${MCP_URL_ENV} (HTTP) untuk memakainya. Jalur ini opsional: pengukuran massal tetap ` +
      `berjalan sepenuhnya dari snapshot lokal. Ambil snapshot dengan ` +
      `\`node scripts/kbbi-validate.mjs snapshot\`, lalu ulangi perintah ini.`,
  }
}

export class McpUnavailableError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'McpUnavailableError'
  }
}

interface McpCall {
  jsonrpc: '2.0'
  id: number
  method: 'tools/call'
  params: { name: string; arguments: Record<string, unknown> }
}

/** One JSON-RPC request over stdio, newline-delimited. */
function callStdio(command: string, payload: McpCall, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let settled = false
    const finish = (error: Error | null, value?: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(
      () => finish(new Error(`MCP tidak menjawab dalam ${timeoutMs} ms`)),
      timeoutMs,
    )
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
      const line = out.split('\n').find((entry) => entry.trim().length > 0)
      if (!line) return
      try {
        finish(null, JSON.parse(line))
      } catch {
        /* keep buffering until the line is complete JSON */
      }
    })
    child.on('error', (error) => finish(error))
    child.stdin.write(`${JSON.stringify(payload)}\n`)
    child.stdin.end()
  })
}

async function callTool(
  availability: McpAvailability,
  tool: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  if (!availability.available) throw new McpUnavailableError(availability.reason)
  const payload: McpCall = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: tool, arguments: args },
  }
  const url = env[MCP_URL_ENV]
  if (typeof url === 'string' && url.length > 0 && availability.transport === 'http') {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new McpUnavailableError(`MCP HTTP ${response.status} dari ${url}`)
    return response.json()
  }
  return callStdio(env[MCP_COMMAND_ENV] as string, payload, 20_000)
}

/**
 * Cross-check a sample of bulk readings against `cari_kata_dasar` /
 * `pemenggalan_kata` (R6 roles 1 and 3). Returns the disagreements; an empty
 * list is the useful result, meaning the bulk reader matches the reference
 * server on the sample.
 */
export async function crossCheckSample(input: {
  capability: Capability
  size: number
  words: readonly string[]
  bulkRoots: ReadonlyMap<string, string>
  env?: NodeJS.ProcessEnv
}): Promise<McpSample[]> {
  const env = input.env ?? process.env
  const availability = probeMcp(env)
  if (!availability.available) throw new McpUnavailableError(availability.reason)

  const tool = input.capability === 'stem' ? 'cari_kata_dasar' : 'pemenggalan_kata'
  const sample: McpSample[] = []
  for (const word of input.words.slice(0, Math.max(0, input.size))) {
    const bulk = input.bulkRoots.get(word) ?? ''
    const response = (await callTool(availability, tool, { kata: word }, env)) as {
      result?: { content?: Array<{ text?: string }> }
    }
    const text = response?.result?.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text) as Record<string, unknown>
    const mcpRoot =
      input.capability === 'stem'
        ? String(parsed['rootWord'] ?? parsed['kataDasar'] ?? '')
        : String(parsed['sukuKata'] ?? parsed['pemenggalan'] ?? '')
    sample.push({ word, bulkRoot: bulk, mcpRoot, agree: bulk === mcpRoot })
  }
  return sample
}
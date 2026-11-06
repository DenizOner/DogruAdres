import { createConnection } from "node:net"
import { isAbsolute } from "node:path"
import { TAX_CERTIFICATE_MAX_BYTES } from "./tax-certificate-policy"

/**
 * Private, server-only ClamAV INSTREAM adapter. It never sends an absolute
 * document path or permits a remote, unauthenticated clamd TCP endpoint.
 * A signature is NOT a verdict: freshness and a complete stream: OK are
 * required for each exact byte buffer, with all failures denied.
 */
export class TaxCertificateScannerUnavailable extends Error {
  constructor() { super("Private tax certificate scanner unavailable") }
}

const RESPONSE_MAX = 384
const SOCKET_TIMEOUT_MS = 20_000
const SIGNATURE_MAX_AGE_MS = 72 * 60 * 60 * 1000
const FUTURE_SKEW_MS = 10 * 60 * 1000
const CHUNK = 64 * 1024

function refuse(): never { throw new TaxCertificateScannerUnavailable() }

async function command(socketPath: string, data?: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ path: socketPath })
    let done = false
    let response = Buffer.alloc(0)
    const fail = () => {
      if (done) return
      done = true
      socket.destroy()
      reject(new TaxCertificateScannerUnavailable())
    }
    const succeed = (value: string) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(SOCKET_TIMEOUT_MS)
    socket.on("timeout", fail)
    socket.on("error", fail)
    socket.on("close", () => { if (!done) fail() })
    socket.on("data", bytes => {
      if (done) return
      if (response.length + bytes.length > RESPONSE_MAX) return fail()
      response = Buffer.concat([response, bytes])
      const end = response.indexOf(0)
      if (end === -1) return
      if (end !== response.length - 1) return fail()
      const line = response.subarray(0, end).toString("utf8")
      if (!line || line.includes("\n") || line.includes("\r")) return fail()
      succeed(line)
    })
    socket.on("connect", () => {
      if (done) return
      if (!data) {
        socket.end(Buffer.from("zVERSION\0", "ascii"))
        return
      }
      const header = Buffer.from("zINSTREAM\0", "ascii")
      let at = 0
      const writeNext = () => {
        if (done) return
        if (at === data.length) {
          socket.end(Buffer.alloc(4))
          return
        }
        const length = Math.min(CHUNK, data.length - at)
        const frame = Buffer.allocUnsafe(4 + length)
        frame.writeUInt32BE(length, 0)
        data.copy(frame, 4, at, at + length)
        at += length
        socket.write(frame, writeNext)
      }
      socket.write(header, writeNext)
    })
  })
}

/**
 * This is usable only with a trusted local Unix socket under OS ACLs.
 * The daemon's virus database date is checked for every scan; a missing,
 * stale, future-dated or disabled VERSION reply fails closed.
 */
export async function verifyTaxCertificateWithClamd(
  content: Buffer, configuredSocket = process.env.DOGRUADRES_CLAMD_SOCKET
): Promise<void> {
  if (process.platform !== "linux" || !Buffer.isBuffer(content) ||
      content.length < 8 || content.length > TAX_CERTIFICATE_MAX_BYTES ||
      typeof configuredSocket !== "string" ||
      configuredSocket.trim() !== configuredSocket ||
      !isAbsolute(configuredSocket) || configuredSocket.includes("\0"))
    return refuse()

  const version = await command(configuredSocket)
  const match = /^ClamAV [^/\s]+\/([1-9][0-9]*)\/(.+)$/.exec(version)
  if (!match) return refuse()
  const updated = Date.parse(match[2])
  const age = Date.now() - updated
  if (!Number.isFinite(updated) || age < -FUTURE_SKEW_MS ||
      age > SIGNATURE_MAX_AGE_MS) return refuse()

  const result = await command(configuredSocket, content)
  if (result !== "stream: OK") return refuse()
}

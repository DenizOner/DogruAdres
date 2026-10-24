import tls from "node:tls"
import net from "node:net"
import dns from "node:dns"
import { randomBytes } from "node:crypto"

export interface SmtpConfig {
  enabled: boolean
  host: string
  port: number
  security: "ssl" | "tls" | "none"
  username?: string
  password?: string
  fromEmail: string
  fromName?: string
  connectionTimeoutMs?: number
  socketTimeoutMs?: number
}

export interface SendMailOptions {
  to: string
  subject: string
  text: string
  html?: string
}

export interface SendMailResult {
  messageId: string
  accepted: string[]
}

const DEFAULT_TIMEOUT_MS = 15000

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * CGNAT or unspecified ranges.
 */
export const isPrivateIp = (ipOrHost: string, allowLoopback = false): boolean => {
  const normalized = ipOrHost.trim().toLowerCase()
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0" || normalized === "::") {
    return !allowLoopback
  }

  // IPv4 mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIp(normalized.slice(7), allowLoopback)
  }

  // IPv6 checks
  if (normalized.includes(":")) {
    if (normalized.startsWith("fe80:") || normalized.startsWith("fc00:") || normalized.startsWith("fd")) {
      return true
    }
    return false
  }

  // IPv4 checks
  const parts = normalized.split(".").map(Number)
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 127) return !allowLoopback
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 169 && parts[1] === 254) return true // Link-local & cloud metadata
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true // CGNAT
    if (parts[0] === 0) return true
  }

  return false
}

/**
 * Performs DNS resolution and verifies that none of the resolved IPs
 * point to private, loopback or restricted internal networks.
 * Returns the first resolved public IP for direct connection to prevent DNS rebinding.
 */
export async function resolveAndValidateHost(host: string, allowLoopback = false): Promise<string> {
  if (isPrivateIp(host, allowLoopback)) {
    throw new Error(`Connecting to private or internal IP range is disallowed: ${host}`)
  }

  // If host is already an IP literal, it has been validated by isPrivateIp
  const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  const isIpv6 = host.includes(":")
  if (isIpv4 || isIpv6) {
    return host
  }

  const lookupResults = await dns.promises.lookup(host, { all: true, verbatim: true })
  if (!lookupResults || lookupResults.length === 0) {
    throw new Error(`DNS resolution failed for host: ${host}`)
  }

  for (const entry of lookupResults) {
    if (isPrivateIp(entry.address, allowLoopback)) {
      throw new Error(`Resolved address ${entry.address} for host ${host} is in a private/restricted range (SSRF / DNS rebinding protection)`)
    }
  }

  return lookupResults[0].address
}

export const getResolvedSmtpConfig = (): SmtpConfig | null => {
  const enabled = process.env.SMTP_ENABLED !== "false"
  const host = process.env.SMTP_HOST || "smtp.gmail.com"
  const port = parseInt(process.env.SMTP_PORT || "465", 10)
  const securityRaw = (process.env.SMTP_SECURITY || "ssl").toLowerCase()
  const security: "ssl" | "tls" | "none" =
    securityRaw === "ssl" || port === 465 ? "ssl" : securityRaw === "none" ? "none" : "tls"
  const username = process.env.SMTP_USERNAME
  const password = process.env.SMTP_PASSWORD
  const fromEmail = process.env.SMTP_FROM_EMAIL || username
  const fromName = process.env.SMTP_FROM_NAME || "DogruAdres Test"

  if (!host || !fromEmail) {
    return null
  }

  return {
    enabled,
    host,
    port,
    security,
    username,
    password,
    fromEmail,
    fromName,
    connectionTimeoutMs: DEFAULT_TIMEOUT_MS,
  }
}

function sanitizeHeader(val: string, fieldName: string): string {
  if (/[\r\n]/.test(val)) {
    throw new Error(`CRLF injection detected in ${fieldName} header`)
  }
  return val.trim()
}

function encodeSubject(subject: string): string {
  sanitizeHeader(subject, "Subject")
  if (/[^\x20-\x7E]/.test(subject)) {
    return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`
  }
  return subject
}

function dotStuff(content: string): string {
  return content.replace(/(^|\r?\n)\./g, "$1..")
}

export class SmtpConnection {
  private socket: tls.TLSSocket | net.Socket | null = null
  private buffer = ""
  private config: SmtpConfig
  private isTlsUpgraded = false

  constructor(config: SmtpConfig) {
    this.config = config
  }

  private async readReply(): Promise<{ code: number; message: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        reject(new Error(`SMTP response timeout (${this.config.socketTimeoutMs || DEFAULT_TIMEOUT_MS}ms)`))
      }, this.config.socketTimeoutMs || DEFAULT_TIMEOUT_MS)

      const onData = (data: Buffer) => {
        this.buffer += data.toString("utf-8")
        const lines = this.buffer.split("\r\n")
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.length >= 4 && line[3] === " ") {
            const code = parseInt(line.substring(0, 3), 10)
            if (!isNaN(code)) {
              cleanup()
              const message = this.buffer
              this.buffer = lines.slice(i + 1).join("\r\n")
              resolve({ code, message })
              return
            }
          }
        }
      }

      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }

      const onClose = () => {
        cleanup()
        reject(new Error("SMTP connection closed unexpectedly"))
      }

      const cleanup = () => {
        clearTimeout(timeout)
        if (this.socket) {
          this.socket.off("data", onData)
          this.socket.off("error", onError)
          this.socket.off("close", onClose)
        }
      }

      if (!this.socket) {
        clearTimeout(timeout)
        return reject(new Error("Socket not initialized"))
      }

      this.socket.on("data", onData)
      this.socket.on("error", onError)
      this.socket.on("close", onClose)
    })
  }

  public async sendCommand(command: string, expectedCode?: number): Promise<{ code: number; message: string }> {
    if (!this.socket) {
      throw new Error("Socket not connected")
    }
    this.socket.write(command + "\r\n")
    const reply = await this.readReply()
    if (expectedCode && reply.code !== expectedCode) {
      throw new Error(`SMTP command '${command.split(" ")[0]}' failed: ${reply.code} ${reply.message.trim()}`)
    }
    return reply
  }

  public async connect(): Promise<void> {
    const allowTestLoopback = process.env.NODE_ENV === "test" && (this.config.security === "none" || this.config.host === "127.0.0.1")
    const connectIp = await resolveAndValidateHost(this.config.host, allowTestLoopback)

    if (this.config.security === "ssl") {
      await new Promise<void>((resolve, reject) => {
        const socket = tls.connect(
          {
            host: connectIp,
            port: this.config.port,
            rejectUnauthorized: true,
            servername: this.config.host,
            timeout: this.config.connectionTimeoutMs || DEFAULT_TIMEOUT_MS,
          },
          () => {
            this.socket = socket
            this.isTlsUpgraded = true
            resolve()
          }
        )
        socket.once("error", reject)
        socket.once("timeout", () => {
          socket.destroy()
          reject(new Error("TLS connection timeout"))
        })
      })
    } else {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection(
          {
            host: connectIp,
            port: this.config.port,
            timeout: this.config.connectionTimeoutMs || DEFAULT_TIMEOUT_MS,
          },
          () => {
            this.socket = socket
            this.isTlsUpgraded = false
            resolve()
          }
        )
        socket.once("error", reject)
        socket.once("timeout", () => {
          socket.destroy()
          reject(new Error("Socket connection timeout"))
        })
      })
    }

    const banner = await this.readReply()
    if (banner.code !== 220) {
      throw new Error(`Unexpected SMTP banner: ${banner.code} ${banner.message}`)
    }
  }

  /**
   * Upgrades the plaintext socket to TLS using STARTTLS.
   * If STARTTLS is not supported or fails, it fails closed immediately.
   */
  public async upgradeStarttls(): Promise<void> {
    if (!this.socket || this.isTlsUpgraded) {
      return
    }

    const reply = await this.sendCommand("STARTTLS", 220)
    if (reply.code !== 220) {
      throw new Error(`STARTTLS failed with code ${reply.code}: ${reply.message}`)
    }

    // Upgrade the existing socket to TLS
    await new Promise<void>((resolve, reject) => {
      const tlsSocket = tls.connect({
        socket: this.socket as net.Socket,
        servername: this.config.host,
        rejectUnauthorized: true,
      })

      tlsSocket.once("secureConnect", () => {
        this.socket = tlsSocket
        this.isTlsUpgraded = true
        resolve()
      })

      tlsSocket.once("error", (err) => {
        reject(new Error(`STARTTLS handshake failed: ${err.message}`))
      })
    })

    // Re-issue EHLO over the secure TLS channel
    await this.sendCommand("EHLO localhost", 250)
  }

  public async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    const safeTo = sanitizeHeader(options.to, "To")
    const safeFromEmail = sanitizeHeader(this.config.fromEmail, "From Email")
    const safeFromName = this.config.fromName ? sanitizeHeader(this.config.fromName, "From Name") : undefined
    const safeSubject = encodeSubject(options.subject)

    const ehloReply = await this.sendCommand("EHLO localhost", 250)

    // Handle STARTTLS upgrade if security mode is tls
    if (this.config.security === "tls") {
      if (!ehloReply.message.includes("STARTTLS")) {
        throw new Error("Server does not advertise STARTTLS capability; refusing plaintext credentials or transmission")
      }
      await this.upgradeStarttls()
    }

    // Security check: NEVER transmit credentials over plaintext socket unless in explicit test loopback
    if (this.config.username && this.config.password) {
      const isPlaintext = !this.isTlsUpgraded && this.config.security !== "ssl"
      const isTestEnv = process.env.NODE_ENV === "test" && (this.config.host === "127.0.0.1" || this.config.host === "localhost")
      if (isPlaintext && !isTestEnv) {
        throw new Error("Security policy violation: Transmitting credentials over an unencrypted SMTP connection is prohibited")
      }

      const authReply = await this.sendCommand("AUTH LOGIN")
      if (authReply.code !== 334) {
        throw new Error(`AUTH LOGIN initiation failed: ${authReply.code} ${authReply.message}`)
      }
      const userB64 = Buffer.from(this.config.username).toString("base64")
      const userReply = await this.sendCommand(userB64)
      if (userReply.code !== 334) {
        throw new Error(`SMTP user authentication failed: ${userReply.code} ${userReply.message}`)
      }
      const passB64 = Buffer.from(this.config.password.replace(/\s+/g, "")).toString("base64")
      const passReply = await this.sendCommand(passB64)
      if (passReply.code !== 235) {
        throw new Error(`SMTP password authentication failed: ${passReply.code} ${passReply.message}`)
      }
    }

    await this.sendCommand(`MAIL FROM:<${safeFromEmail}>`, 250)
    await this.sendCommand(`RCPT TO:<${safeTo}>`, 250)
    await this.sendCommand("DATA", 354)

    const messageId = `<${Date.now()}.${randomBytes(8).toString("hex")}@${this.config.host}>`
    const fromHeader = safeFromName ? `"${safeFromName}" <${safeFromEmail}>` : safeFromEmail

    let message = ""
    message += `From: ${fromHeader}\r\n`
    message += `To: <${safeTo}>\r\n`
    message += `Subject: ${safeSubject}\r\n`
    message += `Date: ${new Date().toUTCString()}\r\n`
    message += `Message-ID: ${messageId}\r\n`
    message += `MIME-Version: 1.0\r\n`

    if (options.html && options.text) {
      const boundary = `----=_Part_${randomBytes(16).toString("hex")}`
      message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`
      message += `--${boundary}\r\n`
      message += `Content-Type: text/plain; charset=utf-8\r\n`
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`
      message += dotStuff(options.text) + "\r\n\r\n"
      message += `--${boundary}\r\n`
      message += `Content-Type: text/html; charset=utf-8\r\n`
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`
      message += dotStuff(options.html) + "\r\n\r\n"
      message += `--${boundary}--\r\n`
    } else if (options.html) {
      message += `Content-Type: text/html; charset=utf-8\r\n`
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`
      message += dotStuff(options.html) + "\r\n"
    } else {
      message += `Content-Type: text/plain; charset=utf-8\r\n`
      message += `Content-Transfer-Encoding: 8bit\r\n\r\n`
      message += dotStuff(options.text) + "\r\n"
    }

    message += `.\r\n`

    if (!this.socket) {
      throw new Error("Socket disconnected before sending DATA body")
    }
    this.socket.write(message)
    const dataReply = await this.readReply()
    if (dataReply.code !== 250) {
      throw new Error(`SMTP DATA submission failed: ${dataReply.code} ${dataReply.message}`)
    }

    try {
      await this.sendCommand("QUIT", 221)
    } catch {
      // Ignore QUIT error
    }

    this.close()

    return {
      messageId,
      accepted: [options.to],
    }
  }

  public close(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
  }
}

export const sendSmtpEmail = async (
  options: SendMailOptions,
  overrideConfig?: Partial<SmtpConfig>
): Promise<SendMailResult> => {
  const baseConfig = getResolvedSmtpConfig()
  const config = { ...baseConfig, ...overrideConfig } as SmtpConfig

  if (!config || !config.enabled) {
    throw new Error("SMTP is disabled or not configured")
  }

  if (!config.host || !config.fromEmail) {
    throw new Error("SMTP configuration is incomplete: host and fromEmail address are required")
  }

  const connection = new SmtpConnection(config)
  try {
    await connection.connect()
    return await connection.sendMail(options)
  } finally {
    connection.close()
  }
}

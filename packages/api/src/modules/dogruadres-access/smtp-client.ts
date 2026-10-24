import tls from "node:tls"
import net from "node:net"
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

export const isPrivateIp = (ip: string, allowLoopback = false): boolean => {
  if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1") {
    return !allowLoopback
  }
  const parts = ip.split(".").map(Number)
  if (parts.length === 4) {
    if (parts[0] === 10) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 0 || parts[0] === 127) return true
  }
  return false
}

export const getResolvedSmtpConfig = (): SmtpConfig | null => {
  const enabled = process.env.SMTP_ENABLED !== "false"
  const host = process.env.SMTP_HOST || "smtp.gmail.com"
  const port = parseInt(process.env.SMTP_PORT || "465", 10)
  const securityRaw = (process.env.SMTP_SECURITY || "ssl").toLowerCase()
  const security: "ssl" | "tls" | "none" = securityRaw === "ssl" || port === 465 ? "ssl" : securityRaw === "none" ? "none" : "tls"
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

export class SmtpConnection {
  private socket: tls.TLSSocket | net.Socket | null = null
  private buffer = ""
  private config: SmtpConfig

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
    const allowTestLoopback = process.env.NODE_ENV === "test" && this.config.security === "none"
    if (isPrivateIp(this.config.host, allowTestLoopback)) {
      throw new Error(`Connecting to private IP/range is disallowed: ${this.config.host}`)
    }

    if (this.config.security === "ssl") {
      await new Promise<void>((resolve, reject) => {
        const socket = tls.connect(
          {
            host: this.config.host,
            port: this.config.port,
            rejectUnauthorized: true,
            servername: this.config.host,
            timeout: this.config.connectionTimeoutMs || DEFAULT_TIMEOUT_MS,
          },
          () => {
            this.socket = socket
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
            host: this.config.host,
            port: this.config.port,
            timeout: this.config.connectionTimeoutMs || DEFAULT_TIMEOUT_MS,
          },
          () => {
            this.socket = socket
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

  public async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    await this.sendCommand("EHLO localhost", 250)

    if (this.config.username && this.config.password) {
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

    await this.sendCommand(`MAIL FROM:<${this.config.fromEmail}>`, 250)
    await this.sendCommand(`RCPT TO:<${options.to}>`, 250)
    await this.sendCommand("DATA", 354)

    const messageId = `<${Date.now()}.${randomBytes(8).toString("hex")}@${this.config.host}>`
    const fromHeader = this.config.fromName
      ? `"${this.config.fromName}" <${this.config.fromEmail}>`
      : this.config.fromEmail

    let message = ""
    message += `From: ${fromHeader}\r\n`
    message += `To: <${options.to}>\r\n`
    message += `Subject: ${options.subject}\r\n`
    message += `Date: ${new Date().toUTCString()}\r\n`
    message += `Message-ID: ${messageId}\r\n`
    message += `MIME-Version: 1.0\r\n`
    if (options.html) {
      message += `Content-Type: text/html; charset=utf-8\r\n\r\n`
      message += `${options.html}\r\n`
    } else {
      message += `Content-Type: text/plain; charset=utf-8\r\n\r\n`
      message += `${options.text}\r\n`
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

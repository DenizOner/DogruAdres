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

// BlockLists for comprehensive SSRF prevention across IPv4 and IPv6 CIDR ranges
const ipv4PrivateBlockList = new net.BlockList()
ipv4PrivateBlockList.addSubnet("0.0.0.0", 8, "ipv4") // Current network (RFC 1122)
ipv4PrivateBlockList.addSubnet("10.0.0.0", 8, "ipv4") // Private (RFC 1918)
ipv4PrivateBlockList.addSubnet("100.64.0.0", 10, "ipv4") // Carrier-Grade NAT (RFC 6598)
ipv4PrivateBlockList.addSubnet("169.254.0.0", 16, "ipv4") // Link-local & cloud metadata (RFC 3927)
ipv4PrivateBlockList.addSubnet("172.16.0.0", 12, "ipv4") // Private (RFC 1918)
ipv4PrivateBlockList.addSubnet("192.0.0.0", 24, "ipv4") // IETF Protocol Assignments (RFC 6890)
ipv4PrivateBlockList.addSubnet("192.0.2.0", 24, "ipv4") // TEST-NET-1 documentation (RFC 5737)
ipv4PrivateBlockList.addSubnet("192.168.0.0", 16, "ipv4") // Private (RFC 1918)
ipv4PrivateBlockList.addSubnet("198.18.0.0", 15, "ipv4") // Network benchmark tests (RFC 2544)
ipv4PrivateBlockList.addSubnet("198.51.100.0", 24, "ipv4") // TEST-NET-2 documentation (RFC 5737)
ipv4PrivateBlockList.addSubnet("203.0.113.0", 24, "ipv4") // TEST-NET-3 documentation (RFC 5737)
ipv4PrivateBlockList.addSubnet("224.0.0.0", 4, "ipv4") // Multicast (RFC 5771)
ipv4PrivateBlockList.addSubnet("240.0.0.0", 4, "ipv4") // Reserved/experimental (RFC 1112)
ipv4PrivateBlockList.addAddress("255.255.255.255", "ipv4") // Broadcast

const ipv4LoopbackBlockList = new net.BlockList()
ipv4LoopbackBlockList.addSubnet("127.0.0.0", 8, "ipv4") // Loopback (RFC 1122)

const ipv6PrivateBlockList = new net.BlockList()
ipv6PrivateBlockList.addAddress("::", "ipv6") // Unspecified address (RFC 4291)
ipv6PrivateBlockList.addSubnet("fc00::", 7, "ipv6") // Unique Local Addresses (ULA, RFC 4193 - fc00::/8 & fd00::/8)
ipv6PrivateBlockList.addSubnet("fe80::", 10, "ipv6") // Link-Local Unicast (RFC 4291 - fe80::/10, covers fe80..febf)
ipv6PrivateBlockList.addSubnet("ff00::", 8, "ipv6") // Multicast (RFC 4291)
ipv6PrivateBlockList.addSubnet("2001:db8::", 32, "ipv6") // Documentation (RFC 3849)
ipv6PrivateBlockList.addSubnet("64:ff9b::", 96, "ipv6") // IPv4/IPv6 translation (RFC 6052)
ipv6PrivateBlockList.addSubnet("100::", 64, "ipv6") // Discard-only prefix (RFC 6666)
ipv6PrivateBlockList.addSubnet("2001::", 23, "ipv6") // IETF Protocol Assignments (RFC 2928)
ipv6PrivateBlockList.addSubnet("2002::", 16, "ipv6") // 6to4 prefix with embedded IPv4 (RFC 3056)

const ipv6LoopbackBlockList = new net.BlockList()
ipv6LoopbackBlockList.addAddress("::1", "ipv6") // Loopback (RFC 4291)

const ipv6MappedBlockList = new net.BlockList()
ipv6MappedBlockList.addSubnet("::ffff:0:0", 96, "ipv6") // IPv4-mapped addresses (RFC 4291)

function extractIpv4FromMapped(ip: string): string | null {
  const cleaned = ip.trim().toLowerCase()
  // Check for embedded dotted decimal, e.g. ::ffff:192.168.1.1
  const dottedMatch = cleaned.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dottedMatch && net.isIP(dottedMatch[1]) === 4) {
    return dottedMatch[1]
  }

  // Check for hex segments, e.g. ::ffff:c0a8:101 or ::ffff:c0a8:0101
  const parts = cleaned.split(":")
  if (parts.length >= 2) {
    const p1 = parseInt(parts[parts.length - 2], 16)
    const p2 = parseInt(parts[parts.length - 1], 16)
    if (!isNaN(p1) && !isNaN(p2) && p1 >= 0 && p1 <= 0xffff && p2 >= 0 && p2 <= 0xffff) {
      const o1 = (p1 >> 8) & 0xff
      const o2 = p1 & 0xff
      const o3 = (p2 >> 8) & 0xff
      const o4 = p2 & 0xff
      return `${o1}.${o2}.${o3}.${o4}`
    }
  }

  return null
}

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * ULA, CGNAT, multicast, documentation or unspecified CIDR ranges.
 */
export const isPrivateIp = (ipOrHost: string, allowLoopback = false): boolean => {
  const normalized = ipOrHost.trim().toLowerCase()
  if (normalized === "localhost") {
    return !allowLoopback
  }

  const ipVersion = net.isIP(normalized)
  if (ipVersion === 4) {
    if (ipv4LoopbackBlockList.check(normalized, "ipv4")) {
      return !allowLoopback
    }
    return ipv4PrivateBlockList.check(normalized, "ipv4")
  }

  if (ipVersion === 6) {
    if (ipv6LoopbackBlockList.check(normalized, "ipv6")) {
      return !allowLoopback
    }

    if (ipv6MappedBlockList.check(normalized, "ipv6")) {
      const extractedIpv4 = extractIpv4FromMapped(normalized)
      if (extractedIpv4) {
        if (ipv4LoopbackBlockList.check(extractedIpv4, "ipv4")) {
          return !allowLoopback
        }
        return ipv4PrivateBlockList.check(extractedIpv4, "ipv4")
      }
      return true
    }

    return ipv6PrivateBlockList.check(normalized, "ipv6")
  }

  return false
}

/**
 * Performs DNS resolution and verifies that none of the resolved IPs
 * point to private, loopback or restricted internal networks.
 * Returns the first resolved public IP for direct connection to prevent DNS rebinding.
 */
export async function resolveAndValidateHost(host: string, allowLoopback = false): Promise<string> {
  const trimmed = host.trim()
  if (isPrivateIp(trimmed, allowLoopback)) {
    throw new Error(`Connecting to private or internal IP range is disallowed: ${trimmed}`)
  }

  // If host is already a valid IP literal, it was validated above by isPrivateIp
  if (net.isIP(trimmed) !== 0) {
    return trimmed
  }

  const lookupResults = await dns.promises.lookup(trimmed, { all: true, verbatim: true })
  if (!lookupResults || lookupResults.length === 0) {
    throw new Error(`DNS resolution failed for host: ${trimmed}`)
  }

  for (const entry of lookupResults) {
    if (isPrivateIp(entry.address, allowLoopback)) {
      throw new Error(
        `Resolved address ${entry.address} for host ${trimmed} is in a private/restricted range (SSRF / DNS rebinding protection)`
      )
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
    // Only an isolated loopback mock may use plaintext transport in tests.
    // Never permit unauthenticated or authenticated plaintext SMTP on real targets.
    const allowTestLoopback =
      process.env.NODE_ENV === "test" &&
      (this.config.host === "127.0.0.1" || this.config.host === "::1")
    if (this.config.security === "none" && !allowTestLoopback) {
      throw new Error("Unencrypted SMTP is prohibited outside isolated loopback tests")
    }
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
      const passB64 = Buffer.from(this.config.password).toString("base64")
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

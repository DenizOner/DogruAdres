import net from "node:net"
import { isPrivateIp, getResolvedSmtpConfig, SmtpConnection } from "../smtp-client"

describe("smtp-client unit tests", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe("isPrivateIp", () => {
    it("identifies private IPv4 addresses correctly", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true)
      expect(isPrivateIp("172.16.0.5")).toBe(true)
      expect(isPrivateIp("172.31.255.255")).toBe(true)
      expect(isPrivateIp("192.168.1.1")).toBe(true)
      expect(isPrivateIp("169.254.169.254")).toBe(true)
      expect(isPrivateIp("0.0.0.0")).toBe(true)
    })

    it("allows public hostnames and rejects private addresses by default", () => {
      expect(isPrivateIp("smtp.gmail.com")).toBe(false)
      expect(isPrivateIp("8.8.8.8")).toBe(false)
      expect(isPrivateIp("localhost")).toBe(true)
      expect(isPrivateIp("127.0.0.1")).toBe(true)
      expect(isPrivateIp("localhost", true)).toBe(false)
      expect(isPrivateIp("127.0.0.1", true)).toBe(false)
    })
  })

  describe("getResolvedSmtpConfig", () => {
    it("returns null if no host or from is resolvable", () => {
      delete process.env.SMTP_HOST
      delete process.env.SMTP_FROM_EMAIL
      delete process.env.SMTP_USERNAME
      expect(getResolvedSmtpConfig()).toBeNull()
    })

    it("resolves configuration from SMTP_* environment variables", () => {
      process.env.SMTP_ENABLED = "true"
      process.env.SMTP_HOST = "smtp.gmail.com"
      process.env.SMTP_PORT = "465"
      process.env.SMTP_SECURITY = "ssl"
      process.env.SMTP_USERNAME = "test@gmail.com"
      process.env.SMTP_PASSWORD = "test-app-password"
      process.env.SMTP_FROM_EMAIL = "test@gmail.com"
      process.env.SMTP_FROM_NAME = "DogruAdres Test"

      const config = getResolvedSmtpConfig()
      expect(config).not.toBeNull()
      expect(config?.enabled).toBe(true)
      expect(config?.host).toBe("smtp.gmail.com")
      expect(config?.port).toBe(465)
      expect(config?.security).toBe("ssl")
      expect(config?.username).toBe("test@gmail.com")
      expect(config?.password).toBe("test-app-password")
      expect(config?.fromEmail).toBe("test@gmail.com")
      expect(config?.fromName).toBe("DogruAdres Test")
    })
  })

  describe("transport policy", () => {
    it("rejects plaintext SMTP for external destinations before connecting", async () => {
      const connection = new SmtpConnection({
        enabled: true,
        host: "smtp.example.com",
        port: 25,
        security: "none",
        fromEmail: "sender@example.com",
      })

      await expect(connection.connect()).rejects.toThrow(
        "Unencrypted SMTP is prohibited outside isolated loopback tests"
      )
    })
  })

  describe("SmtpConnection protocol exchange", () => {
    let mockServer: net.Server
    let serverPort: number

    beforeAll(async () => {
      mockServer = net.createServer((socket) => {
        socket.write("220 mock.smtp.server Service ready\r\n")
        let authenticated = false

        socket.on("data", (data) => {
          const str = data.toString("utf-8")
          if (str.startsWith("EHLO")) {
            socket.write("250-mock.smtp.server\r\n250-AUTH LOGIN\r\n250 OK\r\n")
          } else if (str.startsWith("AUTH LOGIN")) {
            socket.write("334 VXNlcm5hbWU6\r\n")
          } else if (str.startsWith(Buffer.from("testuser").toString("base64"))) {
            socket.write("334 UGFzc3dvcmQ6\r\n")
          } else if (str.startsWith(Buffer.from("secretpass").toString("base64"))) {
            authenticated = true
            socket.write("235 2.7.0 Authentication successful\r\n")
          } else if (str.startsWith("MAIL FROM:")) {
            socket.write("250 2.1.0 Sender OK\r\n")
          } else if (str.startsWith("RCPT TO:")) {
            socket.write("250 2.1.5 Recipient OK\r\n")
          } else if (str.startsWith("DATA")) {
            socket.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n")
          } else if (str.includes("\r\n.\r\n")) {
            socket.write("250 2.0.0 Message accepted for delivery\r\n")
          } else if (str.startsWith("QUIT")) {
            socket.write("221 2.0.0 Service closing transmission channel\r\n")
            socket.end()
          }
        })
      })

      await new Promise<void>((resolve) => {
        mockServer.listen(0, "127.0.0.1", () => {
          serverPort = (mockServer.address() as net.AddressInfo).port
          resolve()
        })
      })
    })

    afterAll(async () => {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve())
      })
    })

    it("successfully connects, authenticates and dispatches email", async () => {
      const connection = new SmtpConnection({
        enabled: true,
        host: "127.0.0.1",
        port: serverPort,
        security: "none",
        username: "testuser",
        password: "secretpass",
        fromEmail: "sender@example.com",
        fromName: "DogruAdres Test",
        connectionTimeoutMs: 3000,
        socketTimeoutMs: 3000,
      })

      await connection.connect()
      const result = await connection.sendMail({
        to: "recipient@example.com",
        subject: "Test Subject",
        text: "Hello World!",
      })

      expect(result.accepted).toEqual(["recipient@example.com"])
      expect(result.messageId).toContain("@127.0.0.1")
    })
  })
  describe("security validations: CRLF injection, dot-stuffing and SSRF", () => {
    it("rejects CRLF injection in headers", async () => {
      const conn = new SmtpConnection({
        enabled: true,
        host: "127.0.0.1",
        port: 25,
        security: "none",
        fromEmail: "attacker@example.com\r\nBcc: victim@example.com",
      })

      await expect(
        conn.sendMail({
          to: "valid@example.com",
          subject: "Test",
          text: "Body",
        })
      ).rejects.toThrow("CRLF injection detected")

      const conn2 = new SmtpConnection({
        enabled: true,
        host: "127.0.0.1",
        port: 25,
        security: "none",
        fromEmail: "sender@example.com",
      })

      await expect(
        conn2.sendMail({
          to: "valid@example.com\nInjected-Header: evil",
          subject: "Test",
          text: "Body",
        })
      ).rejects.toThrow("CRLF injection detected")
    })

    it("identifies IPv6 and CGNAT private ranges", () => {
      expect(isPrivateIp("100.64.0.1")).toBe(true)
      expect(isPrivateIp("100.127.255.255")).toBe(true)
      expect(isPrivateIp("fe80::1")).toBe(true)
      expect(isPrivateIp("fc00::1")).toBe(true)
      expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true)
    })
  })

})

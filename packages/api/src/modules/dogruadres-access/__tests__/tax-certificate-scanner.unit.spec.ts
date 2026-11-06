import { createServer, type Socket } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  TaxCertificateScannerUnavailable, verifyTaxCertificateWithClamd
} from "../tax-certificate-scanner"
import { makeSafeTaxCertificatePreview, TaxCertificateSafePreviewUnavailable } from "../tax-certificate-safe-preview"

describe("B22 local ClamAV scanner fail-closed transport", () => {
  const sample = Buffer.from("%PDF-1.7\n% synthetic scanner-only fixture\n%%EOF\n")
  async function withDaemon(
    verdict: string, date: string,
    run: (path: string, frames: Buffer[]) => Promise<void>
  ) {
    const dir = await mkdtemp(join(tmpdir(), "da-clamd-"))
    const path = join(dir, "scan.sock")
    const frames: Buffer[] = []
    const sockets = new Set<Socket>()
    const server = createServer(socket => {
      sockets.add(socket)
      socket.on("close", () => sockets.delete(socket))
      let received = Buffer.alloc(0)
      let mode: "version" | "stream" | undefined
      socket.on("data", bytes => {
        received = Buffer.concat([received, bytes])
        if (!mode) {
          if (received.subarray(0, 9).toString("ascii") === "zVERSION\0") {
            mode = "version"
            socket.end(Buffer.from("ClamAV 1.4.3/28001/" + date + "\0"))
            return
          }
          if (received.subarray(0, 10).toString("ascii") !== "zINSTREAM\0") return
          mode = "stream"
          received = received.subarray(10)
        }
        if (mode !== "stream") return
        while (received.length >= 4) {
          const size = received.readUInt32BE(0)
          if (received.length < 4 + size) return
          if (size === 0) {
            socket.end(Buffer.from(verdict + "\0"))
            return
          }
          frames.push(Buffer.from(received.subarray(4, 4 + size)))
          received = received.subarray(4 + size)
        }
      })
    })
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject)
        server.listen(path, () => { server.off("error", reject); resolve() })
      })
      await run(path, frames)
    } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
      await rm(dir, { recursive: true, force: true })
    }
  }

  it("streams exactly the complete private bytes and accepts only a fresh clean verdict", async () => {
    const now = new Date().toUTCString()
    await withDaemon("stream: OK", now, async (path, frames) => {
      await expect(verifyTaxCertificateWithClamd(sample, path)).resolves.toBeUndefined()
      expect(Buffer.concat(frames)).toEqual(sample)
      expect(frames.length).toBe(1)
    })
  })

  it("denies infection, daemon ERROR and ambiguous positive replies", async () => {
    for (const verdict of ["stream: Fixture-Test-Signature FOUND", "stream: ERROR", "OK", "stream: OK\nignore"]) {
      await withDaemon(verdict, new Date().toUTCString(), async path => {
        await expect(verifyTaxCertificateWithClamd(sample, path))
          .rejects.toBeInstanceOf(TaxCertificateScannerUnavailable)
      })
    }
  })

  it("denies stale signatures, malformed database metadata and future database dates", async () => {
    for (const date of [
      new Date(Date.now() - 96 * 60 * 60 * 1000).toUTCString(),
      "invalid-database-date",
      new Date(Date.now() + 60 * 60 * 1000).toUTCString()
    ]) {
      await withDaemon("stream: OK", date, async (path, frames) => {
        await expect(verifyTaxCertificateWithClamd(sample, path))
          .rejects.toBeInstanceOf(TaxCertificateScannerUnavailable)
        expect(frames).toHaveLength(0)
      })
    }
  })

  it("denies missing local daemon, TCP-style endpoint, invalid socket or invalid bytes", async () => {
    const missing = join(tmpdir(), "da-clamd-missing-" + process.pid + ".sock")
    for (const socket of [missing, "tcp://127.0.0.1:3310", "", "relative.sock"]) {
      await expect(verifyTaxCertificateWithClamd(sample, socket))
        .rejects.toBeInstanceOf(TaxCertificateScannerUnavailable)
    }
    await expect(verifyTaxCertificateWithClamd(Buffer.alloc(7), "/tmp/scan.sock"))
      .rejects.toBeInstanceOf(TaxCertificateScannerUnavailable)
  })
})

describe("B22 isolated safe preview admission", () => {
  it("fails closed when no genuine local ClamAV daemon is configured", async () => {
    const old = process.env.DOGRUADRES_CLAMD_SOCKET
    process.env.DOGRUADRES_CLAMD_SOCKET =
      join(tmpdir(), "da-preview-clamd-missing-" + process.pid + ".sock")
    try {
      for (const mime of ["application/pdf", "image/png", "image/jpeg"] as const) {
        await expect(makeSafeTaxCertificatePreview(
          Buffer.from("%PDF-1.7\n% local synthetic test\n%%EOF\n"), mime
        )).rejects.toBeInstanceOf(TaxCertificateSafePreviewUnavailable)
      }
    } finally {
      if(old===undefined)delete process.env.DOGRUADRES_CLAMD_SOCKET
      else process.env.DOGRUADRES_CLAMD_SOCKET=old
    }
  })
})

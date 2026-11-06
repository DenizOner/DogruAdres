import { spawn } from "node:child_process"
import { inspectTaxCertificate, TAX_CERTIFICATE_MAX_BYTES, type TaxCertificateFormat } from "./tax-certificate-policy"
import { verifyTaxCertificateWithClamd } from "./tax-certificate-scanner"

/**
 * Raster-only, Linux-isolated staff preview. The original private bytes are
 * never a response, a public URL, a command-line argument or a host file.
 * Without a working OS namespace sandbox and fresh local ClamAV both preview
 * and subsequent approval fail closed. This is NOT an approval decision.
 */
export class TaxCertificateSafePreviewUnavailable extends Error {
  constructor() { super("Private tax certificate safe preview unavailable") }
}

const MAX_PNG_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 12_000

function refuse(): never { throw new TaxCertificateSafePreviewUnavailable() }

async function rasterize(content: Buffer, mime: TaxCertificateFormat["mimeType"]): Promise<Buffer> {
  if (process.platform !== "linux") return refuse()
  // Only trusted, fixed executable paths and fixed arguments, never a
  // filename, shell, user-owned path, URL or caller-selected delegate.
  const render = mime === "application/pdf"
    ? ["/usr/bin/pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "900", "-png", "-", "-"]
    : ["/usr/bin/convert", mime === "image/png" ? "png:-" : "jpeg:-",
        "-auto-orient", "-strip", "-resize", "900x900>", "png:-"]
  const bwrap = [
    "--unshare-all", "--new-session", "--die-with-parent",
    "--ro-bind", "/usr", "/usr",
    "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64",
    "--dir", "/etc",
    "--ro-bind-try", "/etc/fonts", "/etc/fonts",
    "--ro-bind-try", "/etc/ImageMagick-6", "/etc/ImageMagick-6",
    "--ro-bind-try", "/etc/alternatives", "/etc/alternatives",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--chdir", "/tmp", "--clearenv",
    "--setenv", "PATH", "/usr/bin:/bin",
    "--setenv", "HOME", "/tmp",
    "--", ...render,
  ]
  // prlimit constrains memory, CPU and output files for the entire child
  // family. Bubblewrap independently denies network, persistent filesystem,
  // host processes and privileged IPC. Missing protection is never optional.
  const args = ["--as=536870912", "--cpu=9", "--fsize=5242880",
    "--", "/usr/bin/bwrap", ...bwrap]
  return new Promise<Buffer>((resolve,reject) => {
    const child = spawn("/usr/bin/prlimit", args, {
      stdio: ["pipe", "pipe", "ignore"],
      env: { PATH:"/usr/bin:/bin", HOME:"/tmp" },
    })
    let done = false, count = 0
    const chunks: Buffer[] = []
    const timer = setTimeout(() => finish(), TIMEOUT_MS)
    const finish = (png?:Buffer) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill("SIGKILL")
      if (png) resolve(png)
      else reject(new TaxCertificateSafePreviewUnavailable())
    }
    child.on("error", () => finish())
    child.stdout?.on("data", (chunk:Buffer) => {
      count += chunk.length
      if (count > MAX_PNG_BYTES) return finish()
      chunks.push(Buffer.from(chunk))
    })
    child.on("close", code => {
      if (code !== 0 || count < 64) return finish()
      const png = Buffer.concat(chunks)
      try {
        const format = inspectTaxCertificate("safe-preview.png", png, "image/png")
        if (format.mimeType !== "image/png") return finish()
        finish(png)
      } catch { finish() }
    })
    child.stdin?.on("error", () => finish())
    child.stdin?.end(content)
  })
}

export async function makeSafeTaxCertificatePreview(
  original:Buffer,mime:TaxCertificateFormat["mimeType"]
):Promise<Buffer> {
  if(!Buffer.isBuffer(original)||original.length<8||original.length>TAX_CERTIFICATE_MAX_BYTES||
     !["application/pdf","image/png","image/jpeg"].includes(mime))
    return refuse()
  try {
    // Require the genuine current original to pass malware scanning before
    // any PDF or image decoder touches it. Scan the generated PNG as well.
    await verifyTaxCertificateWithClamd(original)
    const preview = await rasterize(original,mime)
    await verifyTaxCertificateWithClamd(preview)
    return preview
  } catch { return refuse() }
}

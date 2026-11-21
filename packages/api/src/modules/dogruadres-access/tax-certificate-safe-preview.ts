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

export const TAX_CERTIFICATE_PREVIEW_RENDERER_REVISION = "all-pages-png-20261107-v1"
export const TAX_CERTIFICATE_PREVIEW_MAX_BYTES = 4 * 1024 * 1024
const MAX_PNG_BYTES = TAX_CERTIFICATE_PREVIEW_MAX_BYTES
const TIMEOUT_MS = 12_000

// Execute every PDF page inside the same networkless Bubblewrap namespace.
// The original exists only on the isolated tmpfs, never in a host/public file.
// Missing pages, an exhausted resource budget or a broken decoder reject the
// entire preview, including the independent approval-time recheck.
const PDF_ALL_PAGES_RUNNER = "import re, subprocess, sys\nfrom pathlib import Path\ntry:\n    data = sys.stdin.buffer.read(10485761)\n    if not 8 <= len(data) <= 10485760: raise ValueError(\"size\")\n    source = \"/tmp/da-review-input.pdf\"\n    with open(source, \"xb\") as file: file.write(data)\n    info = subprocess.run([\"/usr/bin/pdfinfo\", source], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=3, check=True).stdout.decode(\"ascii\", \"replace\")\n    matches = re.findall(r\"^Pages:\\s*([1-9][0-9]*)\\s*$\", info, re.M)\n    if len(matches) != 1: raise ValueError(\"page count\")\n    count = int(matches[0])\n    subprocess.run([\"/usr/bin/pdftoppm\", \"-f\", \"1\", \"-l\", str(count), \"-scale-to\", \"900\", \"-png\", source, \"/tmp/da-review-page\"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=True)\n    files = []\n    for path in Path(\"/tmp\").glob(\"da-review-page-*.png\"):\n        matched = re.fullmatch(r\"da-review-page-([0-9]+)\\.png\", path.name)\n        if not matched: raise ValueError(\"unexpected page\")\n        files.append((int(matched.group(1)), str(path)))\n    files.sort()\n    if len(files) != count or any(page != i for i, (page, _) in enumerate(files, 1)): raise ValueError(\"missing page\")\n    subprocess.run([\"/usr/bin/convert\", *[name for _, name in files], \"-append\", \"-strip\", \"png:-\"], stdout=sys.stdout.buffer, stderr=subprocess.DEVNULL, timeout=4, check=True)\nexcept Exception:\n    sys.exit(1)"

function refuse(): never { throw new TaxCertificateSafePreviewUnavailable() }

async function rasterize(content: Buffer, mime: TaxCertificateFormat["mimeType"]): Promise<Buffer> {
  if (process.platform !== "linux") return refuse()
  // Only trusted, fixed executable paths and fixed arguments, never a
  // filename, shell, user-owned path, URL or caller-selected delegate.
  const render = mime === "application/pdf"
    ? ["/usr/bin/python3", "-I", "-c", PDF_ALL_PAGES_RUNNER]
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
  // The isolated temporary input may be the approved full 10 MiB PDF.
  // PNG bytes leaving the sandbox remain separately capped at 4 MiB.
  const args = ["--as=536870912", "--cpu=9", "--fsize=16777216",
    "--", "/usr/bin/bwrap", ...bwrap]
  return new Promise<Buffer>((resolve,reject) => {
    const child = spawn("/usr/bin/prlimit", args, {
      stdio: ["pipe", "pipe", "ignore"],
      // Next's ambient ProcessEnv type requires NODE_ENV, but this sandbox
      // MUST NOT inherit or add it. The assertion affects types only:
      // the child still receives exactly PATH and HOME, nothing else.
      env: { PATH:"/usr/bin:/bin", HOME:"/tmp" } as unknown as NodeJS.ProcessEnv,
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

/** First upload: both the private original and isolated PNG scanned with the
 * SAME actual loaded engine/signature identity; a reload fails closed. */
export async function prepareScannedTaxCertificatePreview(
  original:Buffer,mime:TaxCertificateFormat["mimeType"]
):Promise<{png:Buffer,scanIdentity:string}> {
  if(!Buffer.isBuffer(original)||original.length<8||original.length>TAX_CERTIFICATE_MAX_BYTES||
     !["application/pdf","image/png","image/jpeg"].includes(mime))
    return refuse()
  try {
    const originalIdentity=await verifyTaxCertificateWithClamd(original)
    const png=await rasterize(original,mime)
    const imageIdentity=await verifyTaxCertificateWithClamd(png)
    if(originalIdentity!==imageIdentity)return refuse()
    return {png,scanIdentity:originalIdentity}
  }catch{return refuse()}
}

/** Signature update: scan original and validated cached PNG without rendering
 * the original PDF again. */
export async function rescanTaxCertificateAndPreview(
  original:Buffer,png:Buffer
):Promise<string>{
  if(!Buffer.isBuffer(original)||original.length<8||original.length>TAX_CERTIFICATE_MAX_BYTES||
     !Buffer.isBuffer(png)||png.length<64||png.length>MAX_PNG_BYTES)return refuse()
  try {
    inspectTaxCertificate("safe-preview.png",png,"image/png")
    const originalIdentity=await verifyTaxCertificateWithClamd(original)
    const previewIdentity=await verifyTaxCertificateWithClamd(png)
    if(originalIdentity!==previewIdentity)return refuse()
    return originalIdentity
  }catch{return refuse()}
}

export async function makeSafeTaxCertificatePreview(
  original:Buffer,mime:TaxCertificateFormat["mimeType"]
):Promise<Buffer> {
  return (await prepareScannedTaxCertificatePreview(original,mime)).png
}

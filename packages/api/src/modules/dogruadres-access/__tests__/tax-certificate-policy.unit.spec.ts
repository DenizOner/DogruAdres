import { gzipSync } from "node:zlib"
import {
  inspectTaxCertificate, InvalidTaxCertificate, TAX_CERTIFICATE_MAX_BYTES,
  prepareTaxCertificate, restoreTaxCertificate, type PreparedTaxCertificate
} from "../tax-certificate-policy"

const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n","ascii")
// Actual 1×1 JPEG test file, not the former SOI/APP0/EOI skeleton.
const jpg=Buffer.from(
  [
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwg",
    "JC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIy",
    "MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QA",
    "HwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIh",
    "MUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVW",
    "V1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG",
    "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQF",
    "BgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAV",
    "YnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE",
    "hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq",
    "8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=="
  ].join(""),"base64"
)
// True one-pixel 8-bit RGB PNG with a CRC-checked IHDR/IDAT/IEND and
// a valid zlib scanline; not the previous fake header-only fixture.
const png=Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64"
)

describe("B22 tax certificate ingress format gate (NOT a public upload)",()=>{
  it("recognizes synthetic PDF, JPG/JPEG, and PNG",()=>{
    expect(inspectTaxCertificate("belge.pdf",pdf,"application/pdf"))
      .toEqual({mimeType:"application/pdf",extension:"pdf",byteLength:pdf.length})
    expect(inspectTaxCertificate("belge.jpg",jpg,"image/jpeg").mimeType).toBe("image/jpeg")
    expect(inspectTaxCertificate("belge.JPEG",jpg,"").extension).toBe("jpg")
    expect(inspectTaxCertificate("belge.PNG",png,"application/octet-stream").mimeType)
      .toBe("image/png")
  })
  it("rejects forged PNG chunks, invalid CRC, missing image data and polyglot append",()=>{
    const changed=Buffer.from(png)
    changed[20]^=1 // invalidate a CRC-protected IHDR byte
    const noIdat=Buffer.concat([png.subarray(0,33),png.subarray(png.length-12)])
    const extra=Buffer.concat([png,Buffer.from("MZ executable", "ascii")])
    const badZlib=Buffer.from(png)
    badZlib[48]^=1 // invalidate an IDAT/zlib byte (without rebuilding CRC)
    for(const bytes of [changed,noIdat,extra,badZlib])
      expect(()=>inspectTaxCertificate("belge.png",bytes,"image/png"))
        .toThrow(InvalidTaxCertificate)
    expect(inspectTaxCertificate("belge.png",png).mimeType).toBe("image/png")
    expect(restoreTaxCertificate(prepareTaxCertificate("belge.png",png)))
      .toEqual(png)
  })
  it("accepts exactly 10 MiB but refuses 10 MiB + 1 byte",()=>{
    const head=Buffer.from("%PDF-1.7\n","ascii")
    const tail=Buffer.from("%%EOF","ascii")
    const exact=Buffer.concat([
      head,Buffer.alloc(TAX_CERTIFICATE_MAX_BYTES-head.length-tail.length,32),tail
    ])
    expect(inspectTaxCertificate("belge.pdf",exact).byteLength)
      .toBe(TAX_CERTIFICATE_MAX_BYTES)
    expect(()=>inspectTaxCertificate("belge.pdf",Buffer.concat([exact,Buffer.from(" ")])))
      .toThrow(InvalidTaxCertificate)
  })
  it("refuses forged extensions, spoofed MIME, mismatched signatures, and trailing data",()=>{
    const invalid: Array<[unknown,unknown,unknown?]>=[
      ["belge.pdf",jpg,"application/pdf"],
      ["belge.jpg",pdf,"image/jpeg"],
      ["belge.png",jpg,"image/png"],
      ["belge.pdf",Buffer.from("MZ executable"),"application/pdf"],
      ["belge.pdf",Buffer.from("%PDF-1.7\nno EOF"),"application/pdf"],
      ["belge.pdf",Buffer.concat([pdf,Buffer.from("script")]),"application/pdf"],
      ["belge.jpg",jpg,"application/pdf"],
      ["belge.pdf.exe",pdf],
      ["../belge.pdf",pdf],
      ["a\\belge.pdf",pdf],
      ["belge.pdf ",pdf],
      [".pdf",pdf],
      ["belge.pdf",null],
      ["belge.pdf",Buffer.alloc(0)],
      ["belge.pdf",pdf,42],
    ]
    for(const [name,bytes,mime] of invalid)
      expect(()=>inspectTaxCertificate(name,bytes,mime)).toThrow(InvalidTaxCertificate)
  })
  it("rejects invalid JPEG skeleton, truncated data and appended executable bytes",()=>{
    const skeleton=Buffer.from([255,216,255,224,0,2,255,217])
    const truncated=jpg.subarray(0,jpg.length-3)
    const trailing=Buffer.concat([jpg,Buffer.from("MZ executable")])
    const brokenSegment=Buffer.from(jpg)
    brokenSegment.writeUInt16BE(0xffff,4)
    for(const bytes of [skeleton,truncated,trailing,brokenSegment])
      expect(()=>inspectTaxCertificate("belge.jpeg",bytes,"image/jpeg"))
        .toThrow(InvalidTaxCertificate)
    expect(inspectTaxCertificate("belge.jpeg",jpg).mimeType).toBe("image/jpeg")
    expect(restoreTaxCertificate(prepareTaxCertificate("belge.jpeg",jpg)))
      .toEqual(jpg)
  })
  it("does not disclose original private filenames or byte contents",()=>{
    const info=inspectTaxCertificate("gizli-vergi-123456.pdf",pdf)
    expect(JSON.stringify(info)).not.toContain("gizli")
    expect(JSON.stringify(info)).not.toContain("123456")
    expect(()=>inspectTaxCertificate("../gizli-123456.pdf",pdf))
      .toThrow("Invalid tax certificate")
  })
})


describe("B22 lossless private-document preparation — no storage or upload",()=>{
  it("assigns independent UUID v4 names without applicant PII or predictable names",()=>{
    const a=prepareTaxCertificate("Ozel-Isletme-VKN12345.pdf",pdf)
    const b=prepareTaxCertificate("Ozel-Isletme-VKN12345.pdf",pdf)
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/
    expect(a.internalName).toMatch(uuid)
    expect(b.internalName).toMatch(uuid)
    expect(a.internalName).not.toBe(b.internalName)
    expect(JSON.stringify({name:a.internalName,mime:a.mimeType})).not.toContain("VKN")
    expect(restoreTaxCertificate(a)).toEqual(pdf)
  })
  it("tries lossless compression but keeps already-small documents intact",()=>{
    const a=prepareTaxCertificate("belge.pdf",pdf)
    expect(a.compression).toBe("none")
    expect(a.storedBytes).toEqual(pdf)
    expect(a.storedBytes).not.toBe(pdf)
    expect(restoreTaxCertificate(a)).toEqual(pdf)
  })
  it("roundtrips a compressible approved PDF exactly with gzip and SHA-256",()=>{
    const large=Buffer.concat([
      Buffer.from("%PDF-1.7\n","ascii"),
      Buffer.alloc(250_000,32),
      Buffer.from("%%EOF","ascii"),
    ])
    const stored=prepareTaxCertificate("vergi.pdf",large)
    expect(stored.compression).toBe("gzip")
    expect(stored.storedBytes.length).toBeLessThan(large.length)
    expect(restoreTaxCertificate(stored)).toEqual(large)
  })
  it("denies altered content, metadata, wrong type and over-limit expansion",()=>{
    const large=Buffer.concat([
      Buffer.from("%PDF-1.7\n","ascii"),
      Buffer.alloc(250_000,32),
      Buffer.from("%%EOF","ascii"),
    ])
    const prepared=prepareTaxCertificate("belge.pdf",large)
    for(const changed of [
      {storedBytes:Buffer.from("corrupt gzip")},
      {originalSha256:"a".repeat(64)},
      {originalByteLength:large.length-1},
      {internalName:"path/belge.pdf"},
      {internalName:"00000000-0000-0000-0000-000000000000.pdf"},
      {mimeType:"image/jpeg"},
    ])expect(()=>restoreTaxCertificate({...prepared,...changed} as PreparedTaxCertificate))
      .toThrow(InvalidTaxCertificate)
    const oversized=Buffer.concat([
      Buffer.from("%PDF-1.7\n","ascii"),
      Buffer.alloc(TAX_CERTIFICATE_MAX_BYTES,32),
      Buffer.from("%%EOF","ascii"),
    ])
    const bomb={...prepared,storedBytes:gzipSync(oversized)}
    expect(()=>restoreTaxCertificate(bomb)).toThrow(InvalidTaxCertificate)
  })
})


/**
 * A native provider contract probe against the installed, version-pinned
 * Medusa module, not a browser/private-URL security acceptance.
 * Uses only a fresh disposable OS temp directory with synthetic bytes.
 */
it("Medusa LocalFileService v2.22.0 native contract: private bytes, prefixed key, public-shaped URL",async()=>{
    // Increased timeout for disk I/O under Windows

  const fs=require("node:fs/promises") as typeof import("node:fs/promises")
  const os=require("node:os") as typeof import("node:os")
  const path=require("node:path") as typeof import("node:path")
  const medusaPackage=require("@medusajs/medusa/package.json")
  expect(["2.21.2","2.22.0"]).toContain(medusaPackage.version)
  // Medusa's documented module export forwards the installed provider.
  // It resolves through our declared @medusajs/medusa dependency.
  const {LocalFileService}=require("@medusajs/medusa/file-local")
  expect(typeof LocalFileService).toBe("function")
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-cert-"))
  try{
    const publicDir=path.join(root,"static")
    const privateDir=path.join(root,"documents-private")
    await fs.mkdir(publicDir,{recursive:true})
    const provider=new LocalFileService({},{
      upload_dir:publicDir,
      private_upload_dir:privateDir,
      backend_url:"https://assets.example.invalid/static",
    })
    const prepared=prepareTaxCertificate("synthetic.pdf",pdf)
    const uploaded=await provider.upload({
      filename:prepared.internalName,
      mimeType:prepared.mimeType,
      content:prepared.storedBytes.toString("base64"),
      access:"private",
    })
    // Medusa prepends a timestamp; the physical key is NOT exactly UUID v4.
    expect(uploaded.key).toMatch(/^private-[0-9]+-[0-9a-f-]+\.pdf$/)
    expect(uploaded.key).not.toBe(prepared.internalName)
    expect(await fs.readdir(publicDir)).toEqual([])
    expect(await fs.readdir(privateDir)).toEqual([uploaded.key])
    const returned=await provider.getAsBuffer({fileKey:uploaded.key})
    expect(returned).toEqual(prepared.storedBytes)
    expect(restoreTaxCertificate({...prepared,storedBytes:returned})).toEqual(pdf)
    // Native local provider gives a URL shaped like a PUBLIC static URL,
    // regardless of the private data root. Never forward this URL.
    expect(uploaded.url).toContain("https://assets.example.invalid/static/")
    expect(await provider.getPresignedDownloadUrl({fileKey:uploaded.key}))
      .toBe(uploaded.url)
  }finally{
    // This exact disposable directory was created by this test.
    await fs.rm(root,{recursive:true,force:true})
  }
}, 30000)


describe("B22 immutable private directory — real OS synthetic files, no HTTP",()=>{
  const fs=require("node:fs/promises") as typeof import("node:fs/promises")
  const os=require("node:os") as typeof import("node:os")
  const path=require("node:path") as typeof import("node:path")
  const {
    writePrivateTaxCertificate, readPrivateTaxCertificate,
  }=require("../private-tax-certificate-store") as typeof import("../private-tax-certificate-store")

  it("stores the exact UUID v4 filename outside public static and restores original PDF",async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-private-"))
    try {
      const prepared=prepareTaxCertificate("very-private-vkn123.pdf",pdf)
      const metadata=await writePrivateTaxCertificate(root,prepared)
      expect(metadata.storageKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(await fs.readdir(root)).toEqual([metadata.storageKey])
      expect(metadata.internalName).toMatch(/\.pdf$/)
      expect(JSON.stringify(metadata)).not.toContain("very-private")
      expect(JSON.stringify(metadata)).not.toContain("storedBytes")
      expect(await readPrivateTaxCertificate(root,metadata)).toEqual(pdf)
      expect(()=>inspectTaxCertificate("very-private-vkn123.pdf",pdf)).not.toThrow()
    }finally{ await fs.rm(root,{recursive:true,force:true}) }
  })

  it("keeps gzip on disk only if smaller; returns the original PDF to authorized caller",async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-private-"))
    try {
      const original=Buffer.concat([
        Buffer.from("%PDF-1.7\n","ascii"),Buffer.alloc(160_000,32),Buffer.from("%%EOF","ascii")
      ])
      const prepared=prepareTaxCertificate("belge.pdf",original)
      expect(prepared.compression).toBe("gzip")
      const record=await writePrivateTaxCertificate(root,prepared)
      const physical=await fs.readFile(path.join(root,record.storageKey))
      expect(physical).toEqual(prepared.storedBytes)
      expect(physical).not.toEqual(original)
      expect(await readPrivateTaxCertificate(root,record)).toEqual(original)
      expect((await fs.readdir(root)).length).toBe(1)
    }finally{ await fs.rm(root,{recursive:true,force:true}) }
  })

  it("fails closed for corrupted content, another key, public/workspace root and missing directory",async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-private-"))
    try {
      const prepared=prepareTaxCertificate("belge.pdf",pdf)
      const record=await writePrivateTaxCertificate(root,prepared)
      await expect(readPrivateTaxCertificate(root,{...record,storageKey:"../static"}))
        .rejects.toThrow(InvalidTaxCertificate)
      await expect(readPrivateTaxCertificate(root,{...record,storedByteLength:record.storedByteLength+1}))
        .rejects.toThrow(InvalidTaxCertificate)
      await fs.writeFile(path.join(root,record.storageKey),Buffer.from("corrupted"))
      await expect(readPrivateTaxCertificate(root,record))
        .rejects.toThrow(InvalidTaxCertificate)
      await expect(writePrivateTaxCertificate(process.cwd(),prepared))
        .rejects.toThrow(InvalidTaxCertificate)
      await expect(writePrivateTaxCertificate(path.join(root,"missing"),prepared))
        .rejects.toThrow(InvalidTaxCertificate)
      // No production deletion by this storage helper.
      expect((await fs.readdir(root)).length).toBe(1)
    }finally{ await fs.rm(root,{recursive:true,force:true}) }
  })

  it("refuses root symlink and permissive POSIX root mode",async()=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),"da-b22-private-"))
    const link=path.join(os.tmpdir(),"da-b22-symlink-"+require("node:crypto").randomUUID())
    try {
      const prepared=prepareTaxCertificate("belge.pdf",pdf)
      if(process.platform!=="win32"){
        await fs.chmod(root,0o755)
        await expect(writePrivateTaxCertificate(root,prepared))
          .rejects.toThrow(InvalidTaxCertificate)
        await fs.chmod(root,0o700)
      }
      if(process.platform!=="win32"){
        await fs.symlink(root,link,"dir")
        await expect(writePrivateTaxCertificate(link,prepared))
          .rejects.toThrow(InvalidTaxCertificate)
      }
    }finally{
      await fs.unlink(link).catch(()=>undefined)
      await fs.rm(root,{recursive:true,force:true})
    }
  })
})

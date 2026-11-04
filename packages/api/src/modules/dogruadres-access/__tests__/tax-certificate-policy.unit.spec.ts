import { gzipSync } from "node:zlib"
import {
  inspectTaxCertificate, InvalidTaxCertificate, TAX_CERTIFICATE_MAX_BYTES,
  prepareTaxCertificate, restoreTaxCertificate, type PreparedTaxCertificate
} from "../tax-certificate-policy"

const pdf=Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n","ascii")
const jpg=Buffer.from([255,216,255,224,0,2,255,217])
const png=Buffer.concat([
  Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from([0,0,0,13]),
  Buffer.from("IHDR","ascii"),Buffer.alloc(17),
  Buffer.alloc(4),Buffer.from("IEND","ascii"),Buffer.alloc(4)
])

describe("B22 tax certificate ingress format gate (NOT a public upload)",()=>{
  it("recognizes synthetic PDF, JPG/JPEG, and PNG",()=>{
    expect(inspectTaxCertificate("belge.pdf",pdf,"application/pdf"))
      .toEqual({mimeType:"application/pdf",extension:"pdf",byteLength:pdf.length})
    expect(inspectTaxCertificate("belge.jpg",jpg,"image/jpeg").mimeType).toBe("image/jpeg")
    expect(inspectTaxCertificate("belge.JPEG",jpg,"").extension).toBe("jpg")
    expect(inspectTaxCertificate("belge.PNG",png,"application/octet-stream").mimeType)
      .toBe("image/png")
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
  const fs=require("node:fs/promises") as typeof import("node:fs/promises")
  const os=require("node:os") as typeof import("node:os")
  const path=require("node:path") as typeof import("node:path")
  const medusaPackage=require("@medusajs/medusa/package.json")
  const localPackage=require("@medusajs/file-local/package.json")
  expect(medusaPackage.version).toBe("2.22.0")
  expect(localPackage.version).toBe("2.22.0")
  const {LocalFileService}=require("@medusajs/file-local")
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
})

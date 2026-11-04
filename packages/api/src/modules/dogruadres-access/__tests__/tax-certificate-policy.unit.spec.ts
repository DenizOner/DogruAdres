import {
  inspectTaxCertificate, InvalidTaxCertificate, TAX_CERTIFICATE_MAX_BYTES
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

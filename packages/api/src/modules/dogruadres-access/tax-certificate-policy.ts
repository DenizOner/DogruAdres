/**
 * B22 verification of the approved tax-certificate file type and 10 MiB limit.
 * NOT an antivirus scan, PDF/image decoder, storage provider or upload endpoint.
 * Never expose these bytes before private storage and an authorized read path exist.
 */
export const TAX_CERTIFICATE_MAX_BYTES = 10 * 1024 * 1024
export type TaxCertificateFormat = Readonly<{
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png'
  extension: 'pdf' | 'jpg' | 'png'
  byteLength: number
}>

export class InvalidTaxCertificate extends Error {
  constructor() { super('Invalid tax certificate'); this.name='InvalidTaxCertificate' }
}

const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10])
const PDF_EOF = Buffer.from('%%EOF','ascii')

function detect(bytes: Buffer): TaxCertificateFormat['mimeType'] | null {
  if (bytes.length >= 45 && bytes.subarray(0,8).equals(PNG_SIGNATURE) &&
      bytes.readUInt32BE(8)===13 && bytes.toString('ascii',12,16)==='IHDR' &&
      bytes.readUInt32BE(bytes.length-12)===0 &&
      bytes.toString('ascii',bytes.length-8,bytes.length-4)==='IEND') return 'image/png'
  if (bytes.length>=8 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 &&
      bytes[bytes.length-2]===255 && bytes[bytes.length-1]===217) return 'image/jpeg'
  if (bytes.length>=14 && /^%PDF-(1\.[0-7]|2\.0)/.test(bytes.toString('ascii',0,8))) {
    const end=bytes.lastIndexOf(PDF_EOF)
    if (end>=bytes.length-2048 && end>=0 &&
        bytes.subarray(end+PDF_EOF.length).every(x=>[9,10,13,32].includes(x)))
      return 'application/pdf'
  }
  return null
}

/** Result contains only the detected type and byte count, not user input. */
export function inspectTaxCertificate(
  filename: unknown, content: unknown, claimedMime?: unknown
): TaxCertificateFormat {
  if(typeof filename!=='string' || filename.length<5 || filename.length>160 ||
     filename!==filename.trim() || filename.startsWith('.') ||
     Array.from(filename).some(c=>c==='/'||c==='\\'||c.charCodeAt(0)<32||c.charCodeAt(0)===127))
    throw new InvalidTaxCertificate()
  if(!Buffer.isBuffer(content)||content.length<8||content.length>TAX_CERTIFICATE_MAX_BYTES)
    throw new InvalidTaxCertificate()
  const extension=filename.split('.').pop()?.toLowerCase()
  if(!extension||!['pdf','jpg','jpeg','png'].includes(extension))
    throw new InvalidTaxCertificate()
  const actual=detect(content)
  const expected=extension==='pdf'?'application/pdf':
    extension==='png'?'image/png':'image/jpeg'
  if(actual===null||actual!==expected)throw new InvalidTaxCertificate()
  if(claimedMime!==undefined&&claimedMime!==null){
    if(typeof claimedMime!=='string')throw new InvalidTaxCertificate()
    const value=claimedMime.trim().toLowerCase()
    if(value!==''&&value!=='application/octet-stream'&&value!==actual)
      throw new InvalidTaxCertificate()
  }
  return {mimeType:actual,extension:extension==='jpeg'?'jpg':extension as TaxCertificateFormat['extension'],byteLength:content.length}
}

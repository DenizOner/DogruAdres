import { createHash, randomUUID } from "node:crypto"
import { gzipSync, gunzipSync, inflateSync } from "node:zlib"

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

// PNG acceptance must not be based on IHDR/IEND signatures alone. Validate
// chunk structure/CRC, a bounded zlib stream and scanline filters. Retain the
// exact original bytes per the approved document retention policy.
// This does NOT replace antivirus scanning or a sandboxed image renderer.
const PNG_CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{
  let value=n
  for(let k=0;k<8;k++)value=(value&1)?0xedb88320^(value>>>1):value>>>1
  return value>>>0
})
function pngCrc32(bytes:Buffer,start:number,end:number):number{
  let value=0xffffffff
  for(let i=start;i<end;i++)
    value=PNG_CRC_TABLE[(value^bytes[i])&255]^(value>>>8)
  return (value^0xffffffff)>>>0
}
const PNG_MAX_EXPANDED_BYTES=64*1024*1024
function validPng(bytes:Buffer):boolean{
  if(bytes.length<57||!bytes.subarray(0,8).equals(PNG_SIGNATURE))return false
  const channelsByColor:Record<number,number>={0:1,2:3,3:1,4:2,6:4}
  const depthsByColor:Record<number,readonly number[]>={
    0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]
  }
  let pos=8,chunks=0,width=0,height=0,depth=0,channels=0,interlace=0,color=0
  let ihdr=false,plte=false,idat=false,idatFinished=false
  const compressed:Buffer[]=[]
  try{
    while(pos+12<=bytes.length&&++chunks<=4096){
      const length=bytes.readUInt32BE(pos)
      if(length>bytes.length-pos-12)return false
      const type=bytes.toString("ascii",pos+4,pos+8)
      const data=pos+8,end=data+length
      if(!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)||
         pngCrc32(bytes,pos+4,end)!==bytes.readUInt32BE(end))return false
      if(!ihdr&&type!=="IHDR")return false
      if(idat&&type!=="IDAT")idatFinished=true
      if(type==="IHDR"){
        if(ihdr||pos!==8||length!==13)return false
        width=bytes.readUInt32BE(data);height=bytes.readUInt32BE(data+4)
        depth=bytes[data+8];color=bytes[data+9];channels=channelsByColor[color]??0
        if(!width||!height||!channels||!depthsByColor[color]?.includes(depth)||
           bytes[data+10]!==0||bytes[data+11]!==0||![0,1].includes(bytes[data+12]))
          return false
        interlace=bytes[data+12];ihdr=true
      }else if(type==="PLTE"){
        if(idat||plte||[0,4].includes(color)||length<3||length>768||length%3!==0)
          return false
        plte=true
      }else if(type==="IDAT"){
        if(!ihdr||idatFinished||length===0||(color===3&&!plte))return false
        idat=true;compressed.push(bytes.subarray(data,end))
      }else if(type==="IEND"){
        if(length!==0||!idat||end+4!==bytes.length)return false
        const passes=interlace
          ? [[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],
             [0,2,2,4],[1,0,2,2],[0,1,1,2]]
          : [[0,0,1,1]]
        const scanlines:[number,number][]=[]
        let expanded=0
        for(const [x,y,dx,dy] of passes){
          if(x>=width||y>=height)continue
          const cols=Math.ceil((width-x)/dx),rows=Math.ceil((height-y)/dy)
          const stride=Math.ceil(cols*channels*depth/8)
          expanded+=rows*(1+stride)
          if(!Number.isSafeInteger(expanded)||expanded>PNG_MAX_EXPANDED_BYTES)
            return false
          scanlines.push([rows,stride])
        }
        if(!expanded)return false
        const plain=inflateSync(Buffer.concat(compressed),{maxOutputLength:expanded})
        if(plain.length!==expanded)return false
        let index=0
        for(const [rows,stride] of scanlines)
          for(let row=0;row<rows;row++){
            if(plain[index]>4)return false
            index+=1+stride
          }
        return index===plain.length
      }else if(!["cHRM","gAMA","sRGB","pHYs","bKGD","sBIT","tRNS","tIME"].includes(type)||
               length>65536) return false
      pos=end+4
    }
  }catch{return false}
  return false
}
const PDF_EOF = Buffer.from('%%EOF','ascii')

function detect(bytes: Buffer): TaxCertificateFormat['mimeType'] | null {
  if(validPng(bytes))return 'image/png'
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


/**
 * Private storage preparation only. Does not write files, publish a URL,
 * grant access, or replace malware/PDF/image validation.
 * The returned bytes are opaque: no consumer may serve them directly.
 */
export type PreparedTaxCertificate = Readonly<{
  internalName: string
  mimeType: TaxCertificateFormat["mimeType"]
  compression: "gzip" | "none"
  originalByteLength: number
  originalSha256: string
  storedBytes: Buffer
}>

const UUID_V4_FILE=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|jpg|png)$/

export function prepareTaxCertificate(
  originalFilename: unknown, content: unknown, claimedMime?: unknown
): PreparedTaxCertificate {
  const kind=inspectTaxCertificate(originalFilename,content,claimedMime)
  const source=content as Buffer
  // PDF/JPEG/PNG are commonly already compressed. Try lossless gzip, but
  // retain original bytes if gzip would waste space.
  const compressed=gzipSync(source)
  const useful=compressed.length<source.length
  return {
    internalName: randomUUID()+"."+kind.extension,
    mimeType: kind.mimeType,
    compression: useful?"gzip":"none",
    originalByteLength: source.length,
    originalSha256: createHash("sha256").update(source).digest("hex"),
    storedBytes: useful?compressed:Buffer.from(source),
  }
}

/**
 * Restore exactly the submitted document, failing closed on corruption or
 * expansion beyond the approved ORIGINAL 10 MiB limit.
 */
export function restoreTaxCertificate(record: PreparedTaxCertificate): Buffer {
  if(!record||typeof record!=="object"||
     typeof record.internalName!=="string"||!UUID_V4_FILE.test(record.internalName)||
     !Buffer.isBuffer(record.storedBytes)||
     record.storedBytes.length<1||record.storedBytes.length>TAX_CERTIFICATE_MAX_BYTES||
     !Number.isSafeInteger(record.originalByteLength)||
     record.originalByteLength<8||record.originalByteLength>TAX_CERTIFICATE_MAX_BYTES||
     typeof record.originalSha256!=="string"||
     !/^[0-9a-f]{64}$/.test(record.originalSha256)||
     !["gzip","none"].includes(record.compression))throw new InvalidTaxCertificate()
  let original: Buffer
  try {
    original=record.compression==="gzip"?
      gunzipSync(record.storedBytes,{maxOutputLength:TAX_CERTIFICATE_MAX_BYTES}):
      Buffer.from(record.storedBytes)
  } catch {throw new InvalidTaxCertificate()}
  if(original.length!==record.originalByteLength ||
     createHash("sha256").update(original).digest("hex")!==record.originalSha256)
    throw new InvalidTaxCertificate()
  const kind=inspectTaxCertificate(record.internalName,original,record.mimeType)
  if(kind.byteLength!==record.originalByteLength)throw new InvalidTaxCertificate()
  return original
}

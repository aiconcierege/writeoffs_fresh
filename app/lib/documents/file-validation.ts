// Content signatures precede all format-specific parsing. Names and browser MIME
// are display hints, never authority for interpreting financial data.
export type FileKind = 'pdf'|'png'|'jpeg'|'webp'|'text'|'unknown'
export function fileKind(bytes: Uint8Array): FileKind {
  const head=new TextDecoder().decode(bytes.slice(0,1024))
  if(head.trimStart().startsWith('%PDF-'))return 'pdf'
  if(bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)return 'png'
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpeg'
  if(head.startsWith('RIFF')&&head.slice(8,12)==='WEBP')return 'webp'
  try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
    if(!text.trim()||/[\x00-\x08\x0b\x0e-\x1f]/.test(text)||/^\s*(?:%PDF|<!doctype|<html|<svg|\{)/i.test(text))return 'unknown'
    return 'text'
  }catch{return 'unknown'}
}
export function assertStructuredText(bytes:Uint8Array){if(fileKind(bytes)!=='text')throw new Error('NOT_STRUCTURED_TEXT');return new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'')}
export function containsDocumentBinaryText(value:unknown){return /%PDF-|\bendobj\b|\bstartxref\b|\/BaseFont\b|ReportLab Generated PDF|\x00/i.test(JSON.stringify(value))}

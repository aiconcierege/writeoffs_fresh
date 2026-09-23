import { parseReceiptText } from './receipt-text'

export type ReceiptWord = { text:string; x:number; y:number; width:number; height:number }
export type ReceiptPage = { page:number; width:number; height:number; words:ReceiptWord[]; text:string }
export type ReceiptRegion = { page:number; x:number; y:number; width:number; height:number }
export type LogicalReceipt = { text:string; regions:ReceiptRegion[] }

function visibleText(words:ReceiptWord[]) {
  const rows:{y:number;height:number;words:ReceiptWord[]}[]=[]
  for(const word of [...words].sort((a,b)=>a.y-b.y||a.x-b.x)){
    const row=rows.find(r=>Math.abs(r.y-word.y)<=Math.max(2,Math.min(r.height,word.height)*0.45))
    if(row)row.words.push(word);else rows.push({y:word.y,height:word.height,words:[word]})
  }
  return rows.map(r=>r.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')).join('\n')
}
const complete=(text:string)=>{
  const p=parseReceiptText(text)
  return !p.reason&&Boolean(p.merchant&&p.occurredOn&&p.totalAmountCents&&p.totalAmountCents>0)
}
function region(page:ReceiptPage,words:ReceiptWord[]):ReceiptRegion {
  const x=Math.max(0,Math.min(...words.map(w=>w.x))-6),y=Math.max(0,Math.min(...words.map(w=>w.y))-6)
  return {page:page.page,x,y,width:Math.min(page.width,Math.max(...words.map(w=>w.x+w.width))+6)-x,
    height:Math.min(page.height,Math.max(...words.map(w=>w.y+w.height))+6)-y}
}
/** Split only across an empty visual strip, with independently complete facts
 * on both sides. Never divide a document because it has a subtotal or two pages. */
function splitPage(page:ReceiptPage,words:ReceiptWord[],depth=0,budget={remaining:120}):LogicalReceipt[] {
  if(depth>7||words.length>20000||budget.remaining--<=0)return [{text:visibleText(words),regions:[region(page,words)]}]
  const candidates:{axis:'x'|'y';at:number;gap:number}[]=[]
  const heights=words.map(w=>w.height).sort((a,b)=>a-b),minimum=Math.max(12,(heights[Math.floor(heights.length/2)]??8)*1.8)
  for(const axis of ['x','y'] as const){
    const size=axis==='x'?'width':'height'
    const sorted=[...words].sort((a,b)=>a[axis]-b[axis]);let end=sorted[0]?.[axis]??0
    for(const word of sorted){
      if(word[axis]-end>=minimum)candidates.push({axis,at:(word[axis]+end)/2,gap:word[axis]-end})
      end=Math.max(end,word[axis]+word[size])
    }
  }
  for(const cut of candidates.sort((a,b)=>b.gap-a.gap)){
    const first=words.filter(w=>w[cut.axis]<cut.at),second=words.filter(w=>w[cut.axis]>=cut.at)
    const left=splitPage(page,first,depth+1,budget),right=splitPage(page,second,depth+1,budget)
    if(left.every(p=>complete(p.text))&&right.every(p=>complete(p.text)))return [...left,...right]
  }
  return [{text:visibleText(words),regions:[region(page,words)]}]
}
const documentIdentity=(text:string)=>text.match(/\b(?:invoice|receipt|policy)\s*(?:number|no\.?|#)\s*[:#]?\s*([a-z0-9-]{3,})/i)?.[1]?.toLowerCase()
const sameDocument=(a:string,b:string)=>Boolean(documentIdentity(a)&&documentIdentity(a)===documentIdentity(b)
  &&parseReceiptText(a).merchant===parseReceiptText(b).merchant)

/** Returns logical documents, or an explicit ambiguity. Original bytes are kept.
 * A repeated invoice identifier can join pages; differing merchants/identifiers
 * establish separate documents. Ambiguous pages never become invented expenses. */
export function receiptBoundaries(pages:ReceiptPage[]):{receipts:LogicalReceipt[];reason:string|null} {
  if(!pages.length||pages.length>10)return {receipts:[],reason:'RECEIPT_BOUNDARY_LIMIT'}
  const parts=pages.flatMap(page=>page.words.length?splitPage(page,page.words):[{text:page.text,regions:[{page:page.page,x:0,y:0,width:page.width,height:page.height}]}])
  if(parts.length>20)return {receipts:[],reason:'RECEIPT_BOUNDARY_LIMIT'}
  if(pages.length===1)return parts.every(p=>complete(p.text))?{receipts:parts,reason:null}:{receipts:[],reason:'RECEIPT_BOUNDARIES_UNCLEAR'}
  const joined=parts.map(p=>p.text).join('\n')
  // One total/date with continuation pages is a single logical document. If all
  // pages repeat complete totals, require a common explicit document identity.
  if(complete(joined)&&parts.every(p=>sameDocument(parts[0].text,p.text)))
    return {receipts:[{text:joined,regions:parts.flatMap(p=>p.regions)}],reason:null}
  const grouped:LogicalReceipt[]=[]
  for(const part of parts){
    const previous=grouped.at(-1)
    if(previous&&sameDocument(previous.text,part.text)){previous.text+='\n'+part.text;previous.regions.push(...part.regions)}
    else grouped.push({...part,regions:[...part.regions]})
  }
  if(!grouped.every(p=>complete(p.text)))return {receipts:[],reason:'RECEIPT_BOUNDARIES_UNCLEAR'}
  for(let i=1;i<grouped.length;i++){
    const a=parseReceiptText(grouped[i-1].text),b=parseReceiptText(grouped[i].text)
    if(a.merchant===b.merchant&&a.occurredOn===b.occurredOn&&a.totalAmountCents===b.totalAmountCents
      &&(!documentIdentity(grouped[i-1].text)||!documentIdentity(grouped[i].text)))
      return {receipts:[],reason:'RECEIPT_BOUNDARIES_UNCLEAR'}
  }
  return {receipts:grouped,reason:null}
}

export function visionReceiptPages(annotation:Record<string,unknown>):ReceiptPage[]{
 const pages=(annotation.pages??[]) as Record<string,unknown>[]
 return pages.map((page,index)=>{
  const words:ReceiptWord[]=[]
  for(const block of (page.blocks??[]) as Record<string,unknown>[])for(const para of (block.paragraphs??[]) as Record<string,unknown>[])
   for(const word of (para.words??[]) as Record<string,unknown>[]){
    const vertices=((word.boundingBox as Record<string,unknown>)?.vertices??[]) as {x?:number;y?:number}[]
    if(vertices.length!==4)continue
    const xs=vertices.map(v=>v.x??0),ys=vertices.map(v=>v.y??0)
    words.push({text:((word.symbols??[]) as {text?:string}[]).map(s=>s.text??'').join(''),x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)})
   }
  return{page:index+1,width:Number(page.width),height:Number(page.height),words,text:visibleText(words)}
 })
}

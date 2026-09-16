// Conservative extraction of visible OCR facts. Never use filenames or bank candidates
// to fill missing receipt fields.
type VisionRow = Record<string, unknown>
const months = ['january','february','march','april','may','june','july','august','september','october','november','december']
const money = /(?:\$\s*|USD\s*)?([0-9]{1,9}(?:,[0-9]{3})*\.\d{2})\b/g
function date(year: string, month: string, day: string) {
  const y=Number(year),m=Number(month),d=Number(day),value=new Date(Date.UTC(y,m-1,d))
  return y>=2000&&y<=2100&&value.getUTCFullYear()===y&&value.getUTCMonth()===m-1&&value.getUTCDate()===d
    ? `${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null
}
export function parseReceiptText(text: string) {
  const lines=text.normalize('NFKC').replace(/[’‘]/g,"'").split(/\r?\n/).map(l=>l.trim()).filter(Boolean)
  const joined=lines.join(' '),dates=new Set<string>()
  for(const match of joined.matchAll(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/g)) {const d=date(match[1],match[2],match[3]);if(d)dates.add(d)}
  for(const match of joined.matchAll(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g)) {const d=date(match[3],match[1],match[2]);if(d)dates.add(d)}
  for(const match of joined.matchAll(/\b([a-z]+)\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi)) {
    const m=months.findIndex(name=>name===match[1].toLowerCase()||name.slice(0,3)===match[1].toLowerCase())
    if(m>=0){const d=date(match[3],String(m+1),match[2]);if(d)dates.add(d)}
  }
  const totals:number[]=[]
  for(let index=0;index<lines.length;index++) {
    // A total can be in the next OCR line. Subtotal, tax and payment IDs are not totals.
    const parts=[...lines[index].matchAll(/\b(?:grand\s+total|amount\s+due|balance\s+due|total)\b/gi)]
    for(let j=0;j<parts.length;j++) {
      const part=parts[j],start=part.index!+part[0].length,end=parts[j+1]?.index??lines[index].length
      const suffix=lines[index].slice(start,end)
      let values=[...suffix.matchAll(money)]
      if(!values.length&&/^\s*[:$]?\s*$/.test(suffix)&&/^\s*\$?\s*[\d,.]+\s*(?:USD)?\s*$/.test(lines[index+1]??''))values=[...lines[index+1].matchAll(money)]
      if(values.length===1)totals.push(Math.round(Number(values[0][1].replace(/,/g,''))*100))
    }
  }
  const amounts=[...new Set(totals)],occurredOn=dates.size===1?[...dates][0]:null
  const merchant=lines.map(line=>line.replace(/[^a-zA-Z0-9&' .-]+/g,' ').trim()).find(line=>
    line.length>=3&&line.length<=120&&!/^(receipt|invoice|date|total|subtotal|amount|thank you)$/i.test(line)
    &&!/^\d|\b(?:total|payment|date|order)\s*:/i.test(line))??null
  const reason=totals.length>1&&dates.size>1?'MULTIPLE_RECEIPTS_DETECTED'
    :amounts.length>1?'RECEIPT_TOTAL_AMBIGUOUS':dates.size>1?'RECEIPT_DATE_AMBIGUOUS':null
  return {merchant,occurredOn,totalAmountCents:amounts.length===1?amounts[0]:null,reason}
}

// Vision sometimes separates the entire label column from the amount column.
// Reconstruct visual text rows from word geometry, not guessed financial values.
export function visionReceiptText(annotation: VisionRow) {
  const words:{text:string;x:number;y:number;height:number}[]=[]
  for(const page of (annotation.pages??[]) as VisionRow[])for(const block of (page.blocks??[]) as VisionRow[])
    for(const paragraph of (block.paragraphs??[]) as VisionRow[])for(const word of (paragraph.words??[]) as VisionRow[]) {
      const vertices=((word.boundingBox as VisionRow)?.vertices??[]) as {x?:number;y?:number}[]
      if(vertices.length!==4)continue
      const text=((word.symbols??[]) as {text?:string}[]).map(s=>s.text??'').join('')
      const ys=vertices.map(v=>v.y??0)
      words.push({text,x:Math.min(...vertices.map(v=>v.x??0)),y:(Math.min(...ys)+Math.max(...ys))/2,height:Math.max(...ys)-Math.min(...ys)})
    }
  if(!words.length)return String(annotation.text??'')
  const rows:{y:number;height:number;words:typeof words}[]=[]
  for(const word of words.sort((a,b)=>a.y-b.y||a.x-b.x)) {
    const row=rows.find(r=>Math.abs(r.y-word.y)<=Math.max(2,Math.min(r.height,word.height)*0.45))
    if(row)row.words.push(word);else rows.push({y:word.y,height:word.height,words:[word]})
  }
  return rows.map(row=>row.words.sort((a,b)=>a.x-b.x).map(word=>word.text).join(' ')).join('\n')
}

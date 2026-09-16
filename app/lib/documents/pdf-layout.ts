export type PdfTextItem={str:string;transform:number[];width:number;height?:number}
export function pdfTextRows(items:PdfTextItem[]){
  const rows:{y:number;items:PdfTextItem[]}[]=[]
  for(const item of items.filter(i=>i.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
    const row=rows.find(r=>Math.abs(r.y-item.transform[5])<=2.5)
    if(row)row.items.push(item);else rows.push({y:item.transform[5],items:[item]})
  }
  return rows.map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]))
}
// Preserve debit/credit column evidence. Do not infer direction from merchant.
export function statementPageText(items:PdfTextItem[]){
  const rows=pdfTextRows(items);let columns:{right:number;kind:'credit'|'debit'|'balance'}[]=[]
  return rows.map(row=>{
    const joined=row.map(i=>i.str.trim()).join(' ')
    if(/\bdate\b/i.test(joined)&&/description|details|transaction/i.test(joined)){
      columns=row.flatMap(i=>{const s=i.str.toLowerCase();const kind=/balance/.test(s)?'balance':/credits?|deposits?/.test(s)?'credit':/debits?|charges?|withdrawals?/.test(s)?'debit':null
        return kind?[{right:i.transform[4]+i.width,kind}]:[]});return joined
    }
    if(!columns.some(c=>c.kind==='credit')||!columns.some(c=>c.kind==='debit')||!/^\d{1,4}[/-]\d{1,2}/.test(joined)||/opening balance|closing balance|beginning balance|ending balance/i.test(joined))return joined
    const money=row.filter(i=>/^\(?[+-]?\$?[\d,]+\.\d{2}\)?$/.test(i.str.trim()))
    const amounts=money.map(item=>({item,column:[...columns].sort((a,b)=>Math.abs(a.right-item.transform[4]-item.width)-Math.abs(b.right-item.transform[4]-item.width))[0]}))
    const economic=amounts.filter(a=>a.column.kind!=='balance')
    if(economic.length!==1)return `AMBIGUOUS_TRANSACTION ${joined}` // preserve the row for review; never guess its amount/direction
    const a=economic[0],description=row.filter(i=>!money.includes(i)).map(i=>i.str.trim()).join(' ')
    const amount=a.item.str.replace(/[+$,()\s-]/g,''),balance=amounts.find(a=>a.column.kind==='balance')?.item.str
    return `${description} ${a.column.kind==='debit'?'-':'+'}${amount}${balance?' '+balance:''}`
  }).join('\n')
}

import {assertStructuredText} from './file-validation'
import {prepareCsvFinancialRows} from '../bookkeeping/csv-ingestion'

export function parseStructuredFile(bytes:Uint8Array){
  const text=assertStructuredText(bytes);if(bytes.length>5*1024*1024)throw new Error('DOCUMENT_TOO_LARGE')
  const records:string[][]=[];let cells:string[]=[],cell='',quoted=false
  for(let i=0;i<text.length;i++){const ch=text[i]
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell.trim())throw new Error('MALFORMED_STRUCTURED_FILE');else quoted=!quoted}
    else if(ch===','&&!quoted){cells.push(cell);cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;cells.push(cell);if(cells.some(c=>c.trim()))records.push(cells);cells=[];cell=''}
    else cell+=ch
    if(records.length>1001||cell.length>4096)throw new Error('DOCUMENT_ROW_LIMIT')
  }
  if(quoted)throw new Error('MALFORMED_STRUCTURED_FILE');cells.push(cell);if(cells.some(c=>c.trim()))records.push(cells)
  const header=records.shift()?.map(h=>h.trim().toLowerCase().replace(/[_-]/g,' '))??[]
  if(header.length<3||!records.length||new Set(header).size!==header.length||records.some(r=>r.length!==header.length))throw new Error('MALFORMED_STRUCTURED_FILE')
  const find=(names:string[])=>header.findIndex(h=>names.includes(h)),date=find(['date','transaction date','posted date','posting date']),description=find(['description','merchant','payee','memo','transaction description']),amount=find(['amount','transaction amount']),debit=find(['debit','debits','withdrawal','withdrawals']),credit=find(['credit','credits','deposit','deposits'])
  if(date<0||description<0||(amount<0&&(debit<0||credit<0)))throw new Error('DOCUMENT_COLUMNS_UNCLEAR')
  const rows=records.map(r=>{let value=r[amount]?.trim();if(amount<0){const d=r[debit].trim(),c=r[credit].trim();if(d&&c)throw new Error('DOCUMENT_DIRECTION_UNCLEAR');if(!d&&!c)throw new Error('DOCUMENT_DIRECTION_UNCLEAR');value=d?'-'+d.replace(/^[+$-]/,''):c}
    return{date:r[date],description:r[description],amount:value}})
  const prepared=prepareCsvFinancialRows({mapping:{date:'date',description:'description',amount:'amount'},rows})
  if(prepared.errors.length||prepared.rows.length!==records.length)throw new Error('DOCUMENT_ROWS_UNCLEAR')
  return prepared.rows
}

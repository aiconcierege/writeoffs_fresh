import { parseDollarCents } from '../manual-money/validation'

function optional(value:unknown,limit:number){if(value==null||value==='')return null;if(typeof value!=='string')return undefined;const text=value.trim();return text&&text.length<=limit?text:undefined}
function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}
export function validateInvoice(input:unknown,today=new Date().toISOString().slice(0,10)){
 if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false as const,error:'Enter the invoice details.'}
 const row=input as Record<string,unknown>;const customerName=optional(row.customerName,200);const customerEmail=optional(row.customerEmail,320)
 const description=optional(row.description,500);const amountCents=parseDollarCents(row.amount)
 const issueDate=typeof row.issueDate==='string'?row.issueDate:'';const dueDate=optional(row.dueDate,10)
 if(!customerName)return{ok:false as const,error:'Enter the customer name.'};if(!description)return{ok:false as const,error:'Describe what the work was for.'}
 if(!amountCents)return{ok:false as const,error:'Enter a positive amount with no more than two decimal places.'}
 if(!calendarDate(issueDate)||issueDate>today)return{ok:false as const,error:'Choose a valid issue date.'}
 if(dueDate&&(!calendarDate(dueDate)||dueDate<issueDate))return{ok:false as const,error:'Due date cannot be before the issue date.'}
 if(customerEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))return{ok:false as const,error:'Enter a valid email address.'}
 const context={jobLabel:optional(row.jobLabel,200),location:optional(row.location,300),note:optional(row.note,1000)}
 if(customerEmail===undefined||dueDate===undefined||Object.values(context).some(value=>value===undefined))return{ok:false as const,error:'One of the invoice details is too long.'}
 return{ok:true as const,value:{customerName,customerEmail,amountCents,currency:'USD',issueDate,dueDate,description,...context}}
}

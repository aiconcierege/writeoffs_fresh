import{describe,expect,it}from'vitest'
import{selectCurrentAskableQuestions,type CustomerQuestion}from'../../app/lib/bookkeeping/customer-questions'

const transaction=(date:string,amountCents=-1000)=>({merchant:'Merchant',amountCents,currency:'USD',date})
const question=(id:string,source:CustomerQuestion['source'],kind:CustomerQuestion['kind'],recordId:string|undefined,
  date:string,extra:Partial<CustomerQuestion>={}):CustomerQuestion=>({id,version:`v-${id}`,source,kind,recordId,
  prompt:id,transaction:transaction(date),openedAt:`${date}T12:00:00.000Z`,...extra})

describe('authoritative current askable question selection',()=>{
  it('is continuous across transaction dates and completed-period boundaries',()=>{
    const selected=selectCurrentAskableQuestions({scope:'business',asOf:'2026-09-08T00:00:00.000Z',
      bookkeeping:[question('aug','bookkeeping','business_use','r-aug','2026-08-20'),
        question('sep5','bookkeeping','business_use','r-sep5','2026-09-05'),
        question('sep7','bookkeeping','business_use','r-sep7','2026-09-07')],deduction:[],contractor:[]})
    expect(selected.map(item=>item.id)).toEqual(['aug','sep5','sep7'])
  })

  it('counts leaves rather than transactions and preserves source identity',()=>{
    const bookkeeping=Array.from({length:4},(_,index)=>question(`b${index}`,'bookkeeping','business_use',`r${index}`,'2026-09-07'))
    const selected=selectCurrentAskableQuestions({scope:'business',asOf:'2026-09-08T00:00:00.000Z',bookkeeping,
      deduction:[question('d1','deduction','percentage','rd','2026-09-07')],
      contractor:[question('c1','contractor','factual_choice',undefined,'2026-09-07')]})
    expect(selected).toHaveLength(6)
    expect(selected.map(item=>item.source)).toEqual(['bookkeeping','bookkeeping','bookkeeping','bookkeeping','deduction','contractor'])
  })

  it('uses existing per-record precedence and specialized deduction precedence',()=>{
    const selected=selectCurrentAskableQuestions({scope:'business',asOf:'2026-09-08T00:00:00.000Z',bookkeeping:[
      question('generic','bookkeeping','transaction_type','same','2026-09-07'),
      question('meal','bookkeeping','meal_relationship','same','2026-09-07'),
      question('business-use','bookkeeping','business_use','phone','2026-09-07')],
      deduction:[question('phone-percent','deduction','percentage','phone','2026-09-07')],contractor:[]})
    expect(selected.map(item=>item.id)).toEqual(['meal','phone-percent'])
  })

  it('excludes a question until its availability time',()=>{
    const deferred=question('deferred','contractor','factual_choice',undefined,'2026-09-07',{
      availableAt:'2026-09-15T00:00:00.000Z'})
    expect(selectCurrentAskableQuestions({scope:'business',asOf:'2026-09-08T00:00:00.000Z',bookkeeping:[],deduction:[],contractor:[deferred]})).toEqual([])
    expect(selectCurrentAskableQuestions({scope:'business',asOf:'2026-09-16T00:00:00.000Z',bookkeeping:[],deduction:[],contractor:[deferred]})).toEqual([deferred])
  })

  it('enforces Expenses membership access for income questions',()=>{
    const income=question('income','bookkeeping','transaction_type','income-record','2026-09-07',{
      transaction:transaction('2026-09-07',2500)})
    expect(selectCurrentAskableQuestions({scope:'expenses',asOf:'2026-09-08T00:00:00.000Z',bookkeeping:[income],deduction:[],contractor:[]})).toEqual([])
  })
})

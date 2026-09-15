import type {CanonicalReport} from './reporting-model'
/** The shared report is the sole authority for Home, Reports and Tax-Time totals. */
export function includeCanonicalVehicleExpenses(report:CanonicalReport, vehicles:Array<{
  method:string; expenses?:Array<{id:string;status:string;kind:string}>
}>, mileageCents:number|null) {
  const excluded=new Set(vehicles.filter(v=>v.method==='standard_mileage').flatMap(v=>(v.expenses??[])
    .filter(e=>e.status==='recorded_not_deducted').map(e=>e.id)))
  const categoryTotals=report.categoryTotals.map(row=>({...row}))
  let removed=0,removedCategorized=0
  for(const row of report.rows) {
    if(!excluded.has(row.recordId)||row.signedAmountCents>=0)continue
    removed+=row.businessAmountCents
    const category=categoryTotals.find(category=>category.categoryKey===row.categoryKey)
    if(category){category.amountCents-=row.businessAmountCents;category.transactionCount=Math.max(0,category.transactionCount-1);removedCategorized+=row.businessAmountCents}
  }
  const mileage=mileageCents??0
  if(mileage) {
    const car=categoryTotals.find(row=>row.categoryKey==='car-truck')
    if(car)car.amountCents+=mileage
    else categoryTotals.push({categoryKey:'car-truck',categoryLabel:'Car and truck expenses',amountCents:mileage,transactionCount:0})
  }
  const businessExpensesCents=report.businessExpensesCents-removed+mileage
  const categorizedBusinessExpensesCents=report.categorizedBusinessExpensesCents-removedCategorized+mileage
  return {...report,businessExpensesCents,businessProfitCents:report.businessIncomeCents-businessExpensesCents,
    categorizedBusinessExpensesCents,uncategorizedBusinessExpensesCents:businessExpensesCents-categorizedBusinessExpensesCents,
    categoryTotals:categoryTotals.filter(row=>row.amountCents!==0)}
}

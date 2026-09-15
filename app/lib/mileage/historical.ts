import {BUSINESS_MILEAGE_RATES} from './vehicle-tax'
export type HistoricalMileagePeriod={from:string;through:string;milesMilli:number}
export function historicalMileagePeriods(joinedMonth:string,coverageStart?:string) {
  const end=new Date(Date.parse(`${joinedMonth}-01T00:00:00Z`)-86400000).toISOString().slice(0,10)
  const start=`${joinedMonth.slice(0,4)}-01-01`
  if(end<start)return []
  const rates=BUSINESS_MILEAGE_RATES.filter(rate=>rate.effectiveFrom<=end&&rate.effectiveThrough>=start)
  const periods=rates.length?rates.map(rate=>({from:rate.effectiveFrom>start?rate.effectiveFrom:start,through:rate.effectiveThrough<end?rate.effectiveThrough:end})):[{from:start,through:end}]
  return periods.flatMap(period=>coverageStart&&coverageStart>period.from&&coverageStart<=period.through?[{from:period.from,through:new Date(Date.parse(coverageStart+'T00:00:00Z')-86400000).toISOString().slice(0,10)},{from:coverageStart,through:period.through}]:[period])
}

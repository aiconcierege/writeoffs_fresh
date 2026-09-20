import {describe,it,expect} from 'vitest'
import {reportPeriod} from '../../app/reports/report-period'

describe('report controls use canonical inclusive calendar dates',()=>{
 it.each([
  ['ytd','2026-09-20','2026-01-01','2026-09-20'],
  ['month','2024-02-17','2024-02-01','2024-02-29'],
  ['month','2026-12-15','2026-12-01','2026-12-31'],
  ['quarter','2026-05-01','2026-04-01','2026-06-30'],
  ['quarter','2026-12-31','2026-10-01','2026-12-31'],
  ['annual','2025-09-20','2025-01-01','2025-12-31'],
 ] as const)('%s for %s', (kind,anchor,start,end)=>{
  expect(reportPeriod(kind,anchor)).toMatchObject({start,end})
 })
})

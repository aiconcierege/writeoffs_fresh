import {describe,it,expect} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {merchantMark} from '../../app/lib/merchant-marks'
describe('local reliable merchant marks',()=>{
 it.each(['ADOBE *CREATIVE CLOUD','GOOGLE WORKSPACE','VERIZON WIRELESS',"McDonald’s Restaurant #123"] )('uses a bundled static asset for %s',merchant=>{
  const result=merchantMark(merchant);expect(result).not.toBeNull();expect(existsSync('public'+result!.src)).toBe(true)
  expect(readFileSync('public'+result!.src,'utf8')).not.toMatch(/<script|https?:\/\/(?!www.w3.org)|href=/)
 })
 it.each(['Coffee with someone from Google','McDonalds consulting llc','Restaurant','Unknown shop'])('falls back without speculative identity for %s',merchant=>{
  expect(merchantMark(merchant)).toBeNull()
 })
})

import * as React from 'react'
import {createRequire} from 'node:module'
import {describe,it,expect,vi} from 'vitest'
import {MonthYearField} from '../../app/components/experience/MonthYearField'
import {BettiPresence} from '../../app/components/experience/BettiPresence'
import {ConversationShell} from '../../app/components/guided/ConversationShell'
const {renderToStaticMarkup}=createRequire(import.meta.url)('react-dom/server') as {renderToStaticMarkup:(node:React.ReactNode)=>string}
vi.stubGlobal('React',React)

describe('UX-1 month precision and accessible presentation',()=>{
 it('asks for exactly month and year, never a fabricated day',()=>{
  const html=renderToStaticMarkup(<MonthYearField label="Business start" value="2022-03" max="2026-09" onChange={()=>{}}/>)
  expect(html.match(/<select /g)).toHaveLength(2)
  expect(html).toContain('<legend>Business start</legend>')
  expect(html).toContain('value="03" selected="">March')
  expect(html).toContain('value="2022" selected="">2022')
  expect(html).not.toMatch(/type="(date|month)"|Calendar|Day/)
  expect(html.match(/required=""/g)).toHaveLength(2)
 })
 it('bounds the visible years and disallows future months in the maximum year',()=>{
  const html=renderToStaticMarkup(<MonthYearField label="Books begin" value="2026-08" max="2026-09" onChange={()=>{}}/>)
  expect(html).not.toContain('value="2027"')
  expect(html).toContain('value="10" disabled="">October')
  expect(html).toContain('value="12" disabled="">December')
  expect(html).toContain('value="09">September')
 })
 it('does not preselect a month or year when the customer has not supplied them',()=>{
  const html=renderToStaticMarkup(<MonthYearField label="Business start" value="" max="2026-09" onChange={()=>{}}/>)
  expect(html.match(/value="" disabled="" selected=""/g)).toHaveLength(2)
 })
 it('keeps character art decorative beside meaningful status and uses approved PNGs only',()=>{
  const html=renderToStaticMarkup(<BettiPresence state="question" engagement="work"/>)
  expect(html).toContain('aria-hidden="true"')
  expect(html).toContain('alt=""')
  expect(html).toContain('betti-question.png')
  expect(html).not.toMatch(/\.riv|\.mp4|iframe|canvas/)
 })
 it('keeps return navigation internal and renders only the supplied question',()=>{
  const html=renderToStaticMarkup(<ConversationShell returnTo="https://untrusted.example" context="From this week"><h1>Was this meal for business?</h1></ConversationShell>)
  expect(html).not.toContain('untrusted.example')
  expect(html).toContain('href="/home"')
  expect(html.match(/<h1/g)).toHaveLength(1)
  expect(html).toContain('From this week')
  expect(html).not.toContain('<main')
 })
})

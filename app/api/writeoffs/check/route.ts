/* File: app/api/writeoffs/check/route.ts
 * Version: v2
 * Date: 2025-11-03
 * Purpose: Deterministic educational lookup for "Ask WriteOffs?"
 * Notes:
 *   - Reads from /knowledge/irs/canon.json
 *   - No AI calls; uses tag matching
 *   - Returns verdict + rationale + citations[]
 */

import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

type Snippet = {
  id: string
  title: string
  section: string
  url: string
  tags: string[]
  text: string
}

type CheckResult = {
  verdict: 'Yes' | 'No' | 'Depends'
  rationale: string
  citations: { title: string; section: string; url: string }[]
}

function classifyFromKeywords(vendor: string, category: string): string[] {
  const text = `${vendor} ${category}`.toLowerCase()
  const tags: string[] = []

  if (text.includes('meal') || text.includes('restaurant') || text.includes('food'))
    tags.push('meals')
  if (text.includes('travel') || text.includes('hotel') || text.includes('flight'))
    tags.push('travel')
  if (text.includes('mileage') || text.includes('uber') || text.includes('lyft') || text.includes('car'))
    tags.push('car_truck')
  if (text.includes('gift'))
    tags.push('gifts')
  if (text.includes('ad') || text.includes('marketing') || text.includes('google') || text.includes('meta'))
    tags.push('advertising')
  if (text.includes('home') && text.includes('office'))
    tags.push('home_office')

  if (tags.length === 0) tags.push('general')
  return tags
}

export async function POST(req: Request) {
  try {
    const { vendor = '', category = '' } = await req.json()

    const canonPath = path.join(process.cwd(), 'knowledge', 'irs', 'canon.json')
    const canonRaw = fs.readFileSync(canonPath, 'utf8')
    const canon = JSON.parse(canonRaw)

    const tags = classifyFromKeywords(vendor, category)

    const snippets: Snippet[] = canon.snippets.filter((s: Snippet) =>
      s.tags.some((t) => tags.includes(t))
    )

    // Fallback if nothing matched
    if (!snippets.length) {
      return NextResponse.json(<CheckResult>{
        verdict: 'Depends',
        rationale:
          'No direct IRS section found for this type of expense. Review Pub 535’s definition of “ordinary and necessary.”',
        citations: [
          {
            title: 'IRS Pub 535 — Business Expenses',
            section: 'Ordinary and necessary expenses',
            url: 'https://www.irs.gov/publications/p535'
          }
        ]
      })
    }

    const primary = snippets[0]
    const verdict: 'Yes' | 'Depends' =
      ['meals', 'travel', 'car_truck', 'gifts', 'home_office'].some((t) => tags.includes(t))
        ? 'Depends'
        : 'Yes'

    return NextResponse.json(<CheckResult>{
      verdict,
      rationale: primary.text,
      citations: snippets.slice(0, 3).map((s) => ({
        title: s.title,
        section: s.section,
        url: s.url
      }))
    })
  } catch (e: any) {
    console.error('check error', e)
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}

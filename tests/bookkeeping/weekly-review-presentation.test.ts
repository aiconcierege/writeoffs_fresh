import { describe, expect, it } from 'vitest'
import {
  formatReviewActivityDate, formatReviewPeriod, reviewCategoryLabel, reviewTreatmentLabel,
} from '../../app/lib/bookkeeping/weekly-review-presentation'
import { readFileSync } from 'node:fs'

describe('weekly review customer presentation', () => {
  it('formats calendar dates without local-time drift', () => {
    expect(formatReviewActivityDate('2026-08-15')).toBe('Aug 15')
  })

  it('gives the immutable review period a concise human label', () => {
    expect(formatReviewPeriod('2026-08-14', '2026-08-20')).toBe('August 14–20')
    expect(formatReviewPeriod('2026-08-29', '2026-09-04')).toBe('August 29–September 4')
    expect(formatReviewPeriod('2025-12-29', '2026-01-04')).toBe('December 29, 2025–January 4, 2026')
  })

  it('shows only an established plain-language category label', () => {
    const labels = { supplies: 'Office supplies', advertising: 'Advertising' }
    expect(reviewCategoryLabel(['supplies'], labels)).toBe('Office supplies')
    expect(reviewCategoryLabel([null], labels)).toBeNull()
    expect(reviewCategoryLabel(['internal-unknown'], labels)).toBeNull()
    expect(reviewCategoryLabel(['supplies', 'advertising'], labels)).toBeNull()
  })

  it('uses factual customer treatment language', () => {
    expect(reviewTreatmentLabel({ role: 'expense', treatment: 'business' })).toBe('Business')
    expect(reviewTreatmentLabel({ role: 'expense', treatment: 'mixed_use' })).toBe('Business + personal')
    expect(reviewTreatmentLabel({ role: 'income', treatment: 'business' })).toBe('Business income')
  })

  it('loads snapshot items in stable activity-date order', () => {
    const repository = readFileSync('app/lib/bookkeeping/weekly-review.ts', 'utf8')
    expect(repository).toContain(".order('occurred_on').order('bookkeeping_record_id').order('id')")
  })
})

import { describe, expect, it } from 'vitest'
import { understandMealAnswer } from '../../app/lib/bookkeeping/meal-answer-understanding'

describe('meal answer understanding', () => {
  it('recognizes attendee context and a stated business purpose in one answer', () => {
    expect(understandMealAnswer('Met with Jim Jones to discuss Kool Aide project')).toMatchObject({
      attendeeRelationship: 'Met with Jim Jones to discuss Kool Aide project',
      businessPurpose: 'to discuss Kool Aide project',
    })
  })

  it('keeps a client relationship without inventing a purpose', () => {
    expect(understandMealAnswer('Jim Jones, client')).toMatchObject({
      attendeeRelationship: 'Jim Jones, client', businessPurpose: null,
    })
  })

  it('keeps a stated purpose without inventing an attendee', () => {
    expect(understandMealAnswer('Discussed Kool Aide project')).toMatchObject({
      attendeeRelationship: null, businessPurpose: 'Discussed Kool Aide project',
    })
  })

  it.each(['Business meeting', 'Talked about work', 'Not sure']) (
    'does not over-infer from ambiguous text: %s', (answer) => {
      expect(understandMealAnswer(answer)).toMatchObject({
        attendeeRelationship: null, businessPurpose: null,
      })
    },
  )

  it('recognizes a bare person name as attendee information only', () => {
    expect(understandMealAnswer('Jim Jones')).toMatchObject({
      attendeeRelationship: 'Jim Jones', businessPurpose: null,
    })
  })
})

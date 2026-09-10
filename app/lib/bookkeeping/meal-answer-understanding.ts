export const MEAL_ANSWER_UNDERSTANDING_VERSION = 'meal-answer-understanding:v1' as const

export type MealAnswerUnderstanding = {
  version: typeof MEAL_ANSWER_UNDERSTANDING_VERSION
  originalAnswer: string
  attendeeRelationship: string | null
  businessPurpose: string | null
}

const RELATIONSHIP = /\b(?:client|customer|prospect|prospective client|vendor|supplier|partner|employee|contractor|consultant|colleague|referral|investor|lender|attorney|accountant)\b/i
const WITH_PERSON = /\b(?:met|meeting|lunch|dinner|breakfast|ate|dined|spoke|talked)\s+with\s+[a-z][a-z.'-]+(?:\s+[a-z][a-z.'-]+){0,3}\b/i
const PROPER_NAME = /^[A-Z][a-z.'-]+(?:\s+[A-Z][a-z.'-]+){1,3}(?:\s*,.*)?$/
const PURPOSE = /\b(?:to\s+(?:discuss|review|plan|pitch|negotiate|work\s+on|talk\s+about|go\s+over|coordinate|present)|discussed|reviewed|planned|pitched|negotiated|worked\s+on|talked\s+about|went\s+over|coordinated|presented)\b\s+.+/i
const VAGUE_PURPOSE = /^(?:(?:to\s+)?(?:discuss|review|plan|work(?:ed)?\s+on|talk(?:ed)?\s+about|meet\s+about|go\s+over|went\s+over)\s+)?(?:work|business|a project|the project|stuff|things)$/i

/**
 * Conservatively recognizes facts explicitly present in a meal response. It
 * does not invent a relationship or treat vague words such as "work" or
 * "meeting" alone as a business purpose.
 */
export function understandMealAnswer(value: string): MealAnswerUnderstanding {
  const originalAnswer = value.trim().replace(/\s+/g, ' ')
  const candidatePurpose = originalAnswer.match(PURPOSE)?.[0]?.trim() ?? null
  const purposeMatch = candidatePurpose && !VAGUE_PURPOSE.test(candidatePurpose)
    ? candidatePurpose : null
  const attendeeSupported = RELATIONSHIP.test(originalAnswer)
    || WITH_PERSON.test(originalAnswer)
    || (PROPER_NAME.test(originalAnswer) && !purposeMatch)
  return {
    version: MEAL_ANSWER_UNDERSTANDING_VERSION,
    originalAnswer,
    attendeeRelationship: attendeeSupported ? originalAnswer : null,
    businessPurpose: purposeMatch,
  }
}

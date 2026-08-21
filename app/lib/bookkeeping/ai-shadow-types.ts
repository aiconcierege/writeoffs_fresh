export const BOOKKEEPING_AI_EVIDENCE_VERSION = 'v1' as const
export const BOOKKEEPING_AI_EVALUATOR_VERSION = 'shadow-v1' as const
export const BOOKKEEPING_AI_PROMPT_VERSION = 'v2' as const
export const BOOKKEEPING_AI_OUTPUT_SCHEMA_VERSION = 'v2' as const

export const AI_EVIDENCE_IDS = [
  'record.amount',
  'record.date',
  'record.source_state',
  'transaction.merchant',
  'transaction.description',
  'account.type',
  'business.description',
  'documents.presence',
  'customer.answers',
] as const
export type AiEvidenceId = (typeof AI_EVIDENCE_IDS)[number]

export type AiBookkeepingEvidence = {
  evidenceVersion: typeof BOOKKEEPING_AI_EVIDENCE_VERSION
  amountCents: number | null
  currency: string
  economicDate: string | null
  ageDays: number | null
  sourceKind: 'financial_transaction' | 'receipt' | 'manual'
  sourceCurrent: boolean
  merchant: string | null
  description: string | null
  accountType: 'checking' | 'savings' | 'credit_card' | null
  businessDescription: string | null
  receiptOrDocumentPresent: boolean
  customerAnswerCount: number
  currentDecision: { treatment: 'unresolved'; provenance: string }
  availableEvidenceIds: AiEvidenceId[]
}

export const AI_ECONOMIC_NATURES = ['expense', 'business_income', 'refund'] as const
export const AI_QUESTION_TYPES = ['business_use', 'business_purpose', 'transaction_type'] as const
export const AI_MISSING_FACTS = ['business_use', 'business_purpose', 'transaction_type'] as const
export const AI_SUPPORT_CODES = [
  'BUSINESS_CONTEXT_MATCH',
  'CUSTOMER_FACT_SUPPORT',
  'DOCUMENT_SUPPORT',
  'DESCRIPTION_SUPPORT',
  'MERCHANT_SUPPORT_ONLY',
  'SOURCE_PATTERN_SUPPORT',
] as const
export const AI_CONFLICT_CODES = [
  'BUSINESS_USE_UNCLEAR',
  'CONFLICTING_EVIDENCE',
  'DOCUMENT_CONFLICT',
  'PERSONAL_OR_MIXED_POSSIBLE',
  'SOURCE_STATE_UNSUPPORTED',
] as const
export const AI_EXPLANATION_CODES = [
  'SUPPORTED_BUSINESS_ACTIVITY',
  'SUPPORTED_BUSINESS_INCOME',
  'SUPPORTED_REFUND',
] as const
export const AI_ABSTAIN_REASONS = [
  'insufficient_evidence',
  'conflicting_evidence',
  'personal_or_mixed_use_possible',
  'unsupported_nature',
  'unsupported_source_state',
  'historical_question_ineligible',
] as const

type SupportCode = (typeof AI_SUPPORT_CODES)[number]
type ConflictCode = (typeof AI_CONFLICT_CODES)[number]

export type AiBookkeepingOutput =
  | {
      outcome: 'propose_decision'
      economicNature: (typeof AI_ECONOMIC_NATURES)[number]
      businessUse: 'business'
      businessAmountCents: number
      excludedAmountCents: number
      evidenceReferences: AiEvidenceId[]
      support: 'strong'
      supportCodes: SupportCode[]
      conflictCodes: []
      explanationCode: (typeof AI_EXPLANATION_CODES)[number]
    }
  | {
      outcome: 'request_fact'
      missingFact: (typeof AI_MISSING_FACTS)[number]
      proposedQuestionType: (typeof AI_QUESTION_TYPES)[number]
      evidenceReferences: AiEvidenceId[]
      support: 'missing_material_fact'
      supportCodes: SupportCode[]
      conflictCodes: ConflictCode[]
    }
  | {
      outcome: 'abstain'
      reason: (typeof AI_ABSTAIN_REASONS)[number]
      evidenceReferences: AiEvidenceId[]
      support: 'insufficient_or_conflicting'
      conflictCodes: ConflictCode[]
    }

export type AiGatewayResult = {
  output: unknown
  providerRequestId: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === 'string' && allowed.includes(value as T[number])
}

function stringArray<T extends readonly string[]>(value: unknown, allowed: T): value is T[number][] {
  return Array.isArray(value) && value.length <= 20
    && new Set(value).size === value.length
    && value.every((item) => enumValue(item, allowed))
}

export type AiOutputDiagnosticIssue = {
  field: string
  issue: 'missing' | 'extra' | 'invalid_type' | 'invalid_value' | 'failed_invariant'
  received?: string | number | boolean | null | string[]
}

function safeReceived(value: unknown): AiOutputDiagnosticIssue['received'] | undefined {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(value)) return value
  if (Array.isArray(value) && value.length <= 20
    && value.every((item) => typeof item === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(item))) {
    return value as string[]
  }
  return undefined
}

function diagnoseShape(input: Record<string, unknown>, keys: string[]) {
  const expected = new Set(keys)
  return [
    ...keys.filter((key) => !(key in input)).map((field) => ({
      field, issue: 'missing' as const,
    })),
    ...Object.keys(input).filter((key) => !expected.has(key)).map(() => ({
      field: '$extra', issue: 'extra' as const,
    })),
  ]
}

/** Safe structural diagnostics only; never includes prompts, evidence text, or provider payloads. */
export function diagnoseAiBookkeepingOutput(value: unknown): AiOutputDiagnosticIssue[] {
  const input = record(value)
  if (!input) return [{ field: '$', issue: 'invalid_type' }]
  if (!['propose_decision', 'request_fact', 'abstain'].includes(String(input.outcome))) {
    return [{ field: 'outcome', issue: 'invalid_value', received: safeReceived(input.outcome) }]
  }
  const outcome = input.outcome
  const keys = outcome === 'propose_decision'
    ? ['outcome', 'economicNature', 'businessUse', 'businessAmountCents', 'excludedAmountCents',
      'evidenceReferences', 'support', 'supportCodes', 'conflictCodes', 'explanationCode']
    : outcome === 'request_fact'
      ? ['outcome', 'missingFact', 'proposedQuestionType', 'evidenceReferences', 'support',
        'supportCodes', 'conflictCodes']
      : ['outcome', 'reason', 'evidenceReferences', 'support', 'conflictCodes']
  const issues: AiOutputDiagnosticIssue[] = diagnoseShape(input, keys)
  const checkEnum = (field: string, allowed: readonly string[]) => {
    if (field in input && !enumValue(input[field], allowed)) issues.push({
      field, issue: 'invalid_value', received: safeReceived(input[field]),
    })
  }
  const checkArray = (field: string, allowed: readonly string[]) => {
    if (field in input && !stringArray(input[field], allowed)) issues.push({
      field, issue: 'invalid_value', received: safeReceived(input[field]),
    })
  }
  checkArray('evidenceReferences', AI_EVIDENCE_IDS)
  checkArray('conflictCodes', AI_CONFLICT_CODES)
  if (outcome === 'propose_decision') {
    checkEnum('economicNature', AI_ECONOMIC_NATURES)
    checkEnum('businessUse', ['business'])
    checkEnum('support', ['strong'])
    checkEnum('explanationCode', AI_EXPLANATION_CODES)
    checkArray('supportCodes', AI_SUPPORT_CODES)
    for (const field of ['businessAmountCents', 'excludedAmountCents']) {
      if (field in input && !Number.isSafeInteger(input[field])) issues.push({
        field, issue: 'invalid_type', received: safeReceived(input[field]),
      })
    }
    if (Array.isArray(input.conflictCodes) && input.conflictCodes.length > 0) issues.push({
      field: 'conflictCodes', issue: 'failed_invariant', received: safeReceived(input.conflictCodes),
    })
  } else if (outcome === 'request_fact') {
    checkEnum('missingFact', AI_MISSING_FACTS)
    checkEnum('proposedQuestionType', AI_QUESTION_TYPES)
    checkEnum('support', ['missing_material_fact'])
    checkArray('supportCodes', AI_SUPPORT_CODES)
    if (input.missingFact !== input.proposedQuestionType) issues.push({
      field: 'missingFact/proposedQuestionType', issue: 'failed_invariant',
    })
  } else {
    checkEnum('reason', AI_ABSTAIN_REASONS)
    checkEnum('support', ['insufficient_or_conflicting'])
  }
  return issues
}

export function parseAiBookkeepingOutput(value: unknown): AiBookkeepingOutput | null {
  const input = record(value)
  if (!input || typeof input.outcome !== 'string') return null
  if (input.outcome === 'propose_decision') {
    if (!exactKeys(input, [
      'outcome', 'economicNature', 'businessUse', 'businessAmountCents',
      'excludedAmountCents', 'evidenceReferences', 'support', 'supportCodes',
      'conflictCodes', 'explanationCode',
    ])) return null
    if (!enumValue(input.economicNature, AI_ECONOMIC_NATURES)
      || input.businessUse !== 'business'
      || !Number.isSafeInteger(input.businessAmountCents)
      || !Number.isSafeInteger(input.excludedAmountCents)
      || !stringArray(input.evidenceReferences, AI_EVIDENCE_IDS)
      || input.support !== 'strong'
      || !stringArray(input.supportCodes, AI_SUPPORT_CODES)
      || !Array.isArray(input.conflictCodes) || input.conflictCodes.length !== 0
      || !enumValue(input.explanationCode, AI_EXPLANATION_CODES)) return null
    return input as AiBookkeepingOutput
  }
  if (input.outcome === 'request_fact') {
    if (!exactKeys(input, [
      'outcome', 'missingFact', 'proposedQuestionType', 'evidenceReferences',
      'support', 'supportCodes', 'conflictCodes',
    ])) return null
    if (!enumValue(input.missingFact, AI_MISSING_FACTS)
      || !enumValue(input.proposedQuestionType, AI_QUESTION_TYPES)
      || input.missingFact !== input.proposedQuestionType
      || !stringArray(input.evidenceReferences, AI_EVIDENCE_IDS)
      || input.support !== 'missing_material_fact'
      || !stringArray(input.supportCodes, AI_SUPPORT_CODES)
      || !stringArray(input.conflictCodes, AI_CONFLICT_CODES)) return null
    return input as AiBookkeepingOutput
  }
  if (input.outcome === 'abstain') {
    if (!exactKeys(input, [
      'outcome', 'reason', 'evidenceReferences', 'support', 'conflictCodes',
    ])) return null
    if (!enumValue(input.reason, AI_ABSTAIN_REASONS)
      || !stringArray(input.evidenceReferences, AI_EVIDENCE_IDS)
      || input.support !== 'insufficient_or_conflicting'
      || !stringArray(input.conflictCodes, AI_CONFLICT_CODES)) return null
    return input as AiBookkeepingOutput
  }
  return null
}

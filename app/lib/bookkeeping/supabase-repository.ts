import type { SupabaseClient } from '@supabase/supabase-js'
import { currentPlaidFinancialState, plaidFinancialTransactionIsCurrent } from '../plaid/current-sources'
import type {
  BookkeepingActor,
  BookkeepingDecisionInput,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
  FinancialSourceEvidence,
  StoredBookkeepingDecision,
  StoredWeeklyReviewEvent,
} from './model'
import type {
  BusinessPurposeAnswer,
  BusinessUseAnswer,
  MixedUseAmountAnswer,
  StoredReviewAnswerResult,
  TransactionTypeAnswer,
  ConflictingEvidenceAnswer,
} from './review-answer-model'
import type { BookkeepingRepository } from './service'
import type { WeeklyReviewRepository } from './review-events'
import type { TrustedConflictQuestion } from './conflict-model'
import type {
  DocumentationRepository,
} from './documentation-events'
import type {
  ReceiptLostResult,
  StoredDocumentationEvent,
} from './documentation-model'

type DatabaseRow = Record<string, unknown>

export class BookkeepingRepositoryError extends Error {
  constructor(
    operation: string,
    message: string,
    readonly code?: string
  ) {
    super(`${operation}: ${message}`)
    this.name = 'BookkeepingRepositoryError'
  }
}

function fail(
  operation: string,
  error: { message: string; code?: string }
): never {
  throw new BookkeepingRepositoryError(operation, error.message, error.code)
}

function oneRow(data: unknown): DatabaseRow | null {
  if (Array.isArray(data)) return (data[0] as DatabaseRow | undefined) ?? null
  return data && typeof data === 'object' ? (data as DatabaseRow) : null
}

function requiredString(row: DatabaseRow, key: string) {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new BookkeepingRepositoryError('map database row', `${key} is missing`)
  }
  return value
}

function nullableString(row: DatabaseRow, key: string) {
  const value = row[key]
  return typeof value === 'string' ? value : null
}

function nullableObject(row: DatabaseRow, key: string) {
  const value = row[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function mapRecord(row: DatabaseRow): CanonicalBookkeepingRecord {
  return {
    id: requiredString(row, 'id'),
    businessId: requiredString(row, 'business_id'),
    authoritativeAmountCents:
      typeof row.authoritative_amount_cents === 'number'
        ? row.authoritative_amount_cents
        : typeof row.amount_cents === 'number'
          ? row.amount_cents
          : null,
    authoritativeCurrency:
      typeof row.authoritative_currency === 'string'
        ? row.authoritative_currency
        : requiredString(row, 'currency'),
  }
}

function mapDecision(
  row: DatabaseRow,
  allocations: BookkeepingDecisionInput['allocations']
): StoredBookkeepingDecision {
  return {
    id: requiredString(row, 'id'),
    businessId: requiredString(row, 'business_id'),
    bookkeepingRecordId: requiredString(row, 'bookkeeping_record_id'),
    supersedesDecisionId: nullableString(row, 'supersedes_decision_id'),
    bookkeepingNature: nullableString(row, 'bookkeeping_nature') as StoredBookkeepingDecision['bookkeepingNature'],
    treatment: requiredString(row, 'treatment') as StoredBookkeepingDecision['treatment'],
    reviewStatus: requiredString(row, 'review_status') as StoredBookkeepingDecision['reviewStatus'],
    provenance: requiredString(row, 'provenance') as StoredBookkeepingDecision['provenance'],
    actorUserId: nullableString(row, 'actor_user_id'),
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    reason: nullableString(row, 'reason'),
    businessPurpose: nullableString(row, 'business_purpose'),
    allocations,
    createdAt: requiredString(row, 'created_at'),
  }
}

function mapDocumentLink(row: DatabaseRow): DocumentationLink {
  return {
    id: requiredString(row, 'id'),
    businessId: requiredString(row, 'business_id'),
    bookkeepingRecordId: requiredString(row, 'bookkeeping_record_id'),
    receiptId: requiredString(row, 'receipt_id'),
    provenance: requiredString(row, 'provenance') as DocumentationLink['provenance'],
    actorUserId: nullableString(row, 'actor_user_id'),
    linkedAt: requiredString(row, 'linked_at'),
    revokedAt: nullableString(row, 'revoked_at'),
    revocationReason: nullableString(row, 'revocation_reason'),
  }
}

function mapWeeklyReviewEvent(row: DatabaseRow): StoredWeeklyReviewEvent {
  return {
    id: requiredString(row, 'id'),
    businessId: requiredString(row, 'business_id'),
    bookkeepingRecordId: requiredString(row, 'bookkeeping_record_id'),
    reviewIssueId: requiredString(row, 'review_issue_id'),
    supersedesEventId: nullableString(row, 'supersedes_event_id'),
    sequenceNumber: Number(row.sequence_number),
    eventType: requiredString(row, 'event_type') as StoredWeeklyReviewEvent['eventType'],
    reason: requiredString(row, 'reason') as StoredWeeklyReviewEvent['reason'],
    basedOnDecisionId: requiredString(row, 'based_on_decision_id'),
    issueKey: requiredString(row, 'issue_key'),
    contextFingerprint: requiredString(row, 'context_fingerprint'),
    evidenceFingerprint: nullableString(row, 'evidence_fingerprint'),
    questionContext: nullableObject(row, 'question_context'),
    answerPayload: nullableObject(row, 'answer_payload'),
    resultingDecisionId: nullableString(row, 'resulting_decision_id'),
    deferredUntil: nullableString(row, 'deferred_until'),
    provenance: requiredString(row, 'provenance') as StoredWeeklyReviewEvent['provenance'],
    actorUserId: nullableString(row, 'actor_user_id'),
    createdAt: requiredString(row, 'created_at'),
  }
}

function mapDocumentationEvent(row: DatabaseRow): StoredDocumentationEvent {
  return {
    id: requiredString(row, 'id'),
    businessId: requiredString(row, 'business_id'),
    bookkeepingRecordId: requiredString(row, 'bookkeeping_record_id'),
    documentationIssueId: requiredString(row, 'documentation_issue_id'),
    supersedesEventId: nullableString(row, 'supersedes_event_id'),
    sequenceNumber: Number(row.sequence_number),
    eventType: requiredString(row, 'event_type') as StoredDocumentationEvent['eventType'],
    reason: requiredString(row, 'reason') as StoredDocumentationEvent['reason'],
    issueKey: requiredString(row, 'issue_key'),
    contextFingerprint: requiredString(row, 'context_fingerprint'),
    evidenceFingerprint: requiredString(row, 'evidence_fingerprint'),
    questionContext: nullableObject(row, 'question_context'),
    assertionPayload: nullableObject(row, 'assertion_payload'),
    documentLinkId: nullableString(row, 'bookkeeping_document_link_id'),
    evidenceSatisfiesRequest:
      typeof row.evidence_satisfies_request === 'boolean'
        ? row.evidence_satisfies_request
        : null,
    provenance: requiredString(row, 'provenance') as StoredDocumentationEvent['provenance'],
    actorUserId: nullableString(row, 'actor_user_id'),
    createdAt: requiredString(row, 'created_at'),
  }
}

export class SupabaseBookkeepingRepository
  implements BookkeepingRepository, WeeklyReviewRepository, DocumentationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findBusinessIdForUser(userId: string) {
    const { data, error } = await this.supabase
      .from('businesses')
      .select('id')
      .eq('owner_user_id', userId)
      .maybeSingle()
    if (error) fail('find Business', error)
    return data?.id ?? null
  }

  async ensureRecord(input: {
    actor: BookkeepingActor
    record: CanonicalRecordInput
  }) {
    const { data, error } = await this.supabase.rpc('ensure_bookkeeping_record', {
      p_business_id: input.actor.businessId,
      p_source_kind: input.record.sourceKind,
      p_financial_transaction_id: input.record.financialTransactionId,
      p_provenance: input.actor.provenance,
      p_ingestion_key: input.record.ingestionKey,
      p_amount_cents: input.record.amountCents,
      p_currency: input.record.currency,
      p_occurred_on: input.record.occurredOn,
    })
    if (error) fail('ensure bookkeeping record', error)
    const row = oneRow(data)
    if (!row) fail('ensure bookkeeping record', { message: 'no row returned' })
    return mapRecord(row)
  }

  async findRecord(businessId: string, recordId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_records')
      .select('id,business_id,amount_cents,currency')
      .eq('business_id', businessId)
      .eq('id', recordId)
      .maybeSingle()
    if (error) fail('find bookkeeping record', error)
    if (!data) return null

    const { data: source, error: sourceError } = await this.supabase
      .from('bookkeeping_financial_sources')
      .select('financial_transaction_id')
      .eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId)
      .is('revoked_at', null)
      .maybeSingle()
    if (sourceError) fail('find bookkeeping source association', sourceError)
    if (!source) return mapRecord(data)

    const financial = await this.findFinancialSource(
      businessId,
      source.financial_transaction_id
    )
    if (!financial) {
      fail('find bookkeeping record', { message: 'active financial source is missing' })
    }
    return mapRecord({
      ...data,
      authoritative_amount_cents: financial.amountCents,
      authoritative_currency: financial.currency,
    })
  }

  async findRecordByFinancialTransaction(
    businessId: string,
    financialTransactionId: string
  ) {
    const { data, error } = await this.supabase
      .from('bookkeeping_financial_sources')
      .select('bookkeeping_record_id')
      .eq('business_id', businessId)
      .eq('financial_transaction_id', financialTransactionId)
      .is('revoked_at', null)
      .maybeSingle()
    if (error) fail('resolve financial bookkeeping source', error)
    return data
      ? this.findRecord(businessId, data.bookkeeping_record_id)
      : null
  }

  async findCurrentDecision(businessId: string, recordId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_decisions')
      .select('*')
      .eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId)
      .order('created_at', { ascending: true })
    if (error) fail('find bookkeeping decisions', error)
    const rows = (data ?? []) as DatabaseRow[]
    if (rows.length === 0) return null
    const superseded = new Set(
      rows.map((row) => nullableString(row, 'supersedes_decision_id')).filter(Boolean)
    )
    const current = rows.find((row) => !superseded.has(requiredString(row, 'id')))
    if (!current) fail('find current bookkeeping decision', { message: 'decision chain has no leaf' })

    const decisionId = requiredString(current, 'id')
    const { data: allocationRows, error: allocationError } = await this.supabase
      .from('bookkeeping_allocations')
      .select('allocation_kind,amount_cents,tax_category_key,memo')
      .eq('business_id', businessId)
      .eq('bookkeeping_decision_id', decisionId)
      .order('created_at', { ascending: true })
    if (allocationError) fail('find bookkeeping allocations', allocationError)
    const allocations = ((allocationRows ?? []) as DatabaseRow[]).map((row) => ({
      kind: requiredString(row, 'allocation_kind') as BookkeepingDecisionInput['allocations'][number]['kind'],
      amountCents: Number(row.amount_cents),
      taxCategoryKey: nullableString(row, 'tax_category_key'),
      memo: nullableString(row, 'memo'),
    }))
    return mapDecision(current, allocations)
  }

  async ensureInitialUnresolvedDecision(businessId: string, recordId: string) {
    const { data, error } = await this.supabase.rpc(
      'ensure_initial_bookkeeping_decision',
      {
        p_business_id: businessId,
        p_bookkeeping_record_id: recordId,
      }
    )
    if (error) fail('ensure initial bookkeeping decision', error)
    if (typeof data !== 'string') {
      fail('ensure initial bookkeeping decision', { message: 'no id returned' })
    }
    const decision = await this.findDecisionById(businessId, data)
    if (!decision) {
      fail('ensure initial bookkeeping decision', {
        message: 'initial decision was not found',
      })
    }
    return decision
  }

  async findFinancialSource(businessId: string, financialTransactionId: string) {
    const { data, error } = await this.supabase
      .from('financial_transactions')
      .select('id,business_id,amount_cents,currency,transaction_date')
      .eq('business_id', businessId)
      .eq('id', financialTransactionId)
      .maybeSingle()
    if (error) fail('find financial source evidence', error)
    if (!data) return null
    const plaidState = await currentPlaidFinancialState({
      supabase: this.supabase, businessId,
      candidateFinancialTransactionIds: [financialTransactionId],
    })
    if (!plaidFinancialTransactionIsCurrent({ id: data.id, state: plaidState })) return null
    return {
      id: data.id,
      businessId: data.business_id,
      amountCents: Number(data.amount_cents),
      currency: data.currency,
      occurredOn: data.transaction_date,
    } satisfies FinancialSourceEvidence
  }

  async attachFinancialSource(
    input: Parameters<BookkeepingRepository['attachFinancialSource']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'attach_bookkeeping_financial_source',
      {
        p_business_id: input.actor.businessId,
        p_bookkeeping_record_id: input.recordId,
        p_financial_transaction_id: input.financialTransactionId,
        p_provenance: input.actor.provenance,
      }
    )
    if (error) fail('attach financial source evidence', error)
    if (typeof data !== 'string') fail('attach financial source evidence', { message: 'no id returned' })
    return data
  }

  async appendDecision(input: Parameters<BookkeepingRepository['appendDecision']>[0]) {
    const { data, error } = await this.supabase.rpc('append_bookkeeping_decision', {
      p_business_id: input.actor.businessId,
      p_bookkeeping_record_id: input.record.id,
      p_expected_current_decision_id: input.supersedesDecisionId,
      p_bookkeeping_nature: input.decision.bookkeepingNature,
      p_treatment: input.decision.treatment,
      p_review_status: input.decision.reviewStatus,
      p_provenance: input.actor.provenance,
      p_confidence: input.decision.confidence ?? null,
      p_reason: input.decision.reason ?? null,
      p_business_purpose: input.decision.businessPurpose ?? null,
      p_allocations: input.decision.allocations.map((allocation) => ({
        kind: allocation.kind,
        amount_cents: allocation.amountCents,
        tax_category_key: allocation.taxCategoryKey ?? null,
        memo: allocation.memo ?? null,
      })),
    })
    if (error) fail('append bookkeeping decision', error)
    if (typeof data !== 'string') fail('append bookkeeping decision', { message: 'no id returned' })
    const decision = await this.findDecisionById(input.actor.businessId, data)
    if (!decision) fail('append bookkeeping decision', { message: 'inserted decision was not found' })
    return decision
  }

  async matchFinancialSourceWithCorrection(
    input: Parameters<BookkeepingRepository['matchFinancialSourceWithCorrection']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'match_bookkeeping_source_with_correction',
      {
        p_business_id: input.actor.businessId,
        p_bookkeeping_record_id: input.record.id,
        p_financial_transaction_id: input.financialSource.id,
        p_expected_current_decision_id: input.supersedesDecisionId,
        p_bookkeeping_nature: input.decision.bookkeepingNature,
        p_treatment: input.decision.treatment,
        p_review_status: input.decision.reviewStatus,
        p_provenance: input.actor.provenance,
        p_confidence: input.decision.confidence ?? null,
        p_reason: input.decision.reason ?? null,
        p_business_purpose: input.decision.businessPurpose ?? null,
        p_allocations: input.decision.allocations.map((allocation) => ({
          kind: allocation.kind,
          amount_cents: allocation.amountCents,
          tax_category_key: allocation.taxCategoryKey ?? null,
          memo: allocation.memo ?? null,
        })),
      }
    )
    if (error) fail('match financial source with correction', error)
    if (typeof data !== 'string') fail('match financial source with correction', { message: 'no id returned' })
    const decision = await this.findDecisionById(input.actor.businessId, data)
    if (!decision) fail('match financial source with correction', { message: 'inserted decision was not found' })
    return decision
  }

  async receiptBelongsToBusiness(businessId: string, receiptId: string) {
    const [{ data: business, error: businessError }, { data: receipt, error: receiptError }] =
      await Promise.all([
        this.supabase.from('businesses').select('owner_user_id').eq('id', businessId).maybeSingle(),
        this.supabase.from('receipts').select('user_id').eq('id', receiptId).maybeSingle(),
      ])
    if (businessError) fail('find receipt Business', businessError)
    if (receiptError) fail('find receipt owner', receiptError)
    return Boolean(business && receipt && business.owner_user_id === receipt.user_id)
  }

  async findActiveDocumentLink(businessId: string, recordId: string, receiptId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_document_links')
      .select('*')
      .eq('business_id', businessId)
      .eq('bookkeeping_record_id', recordId)
      .eq('receipt_id', receiptId)
      .is('revoked_at', null)
      .maybeSingle()
    if (error) fail('find active document link', error)
    return data ? mapDocumentLink(data) : null
  }

  async ensureDocumentLink(input: Parameters<BookkeepingRepository['ensureDocumentLink']>[0]) {
    const { data, error } = await this.supabase.rpc('ensure_bookkeeping_document_link', {
      p_business_id: input.actor.businessId,
      p_bookkeeping_record_id: input.recordId,
      p_receipt_id: input.receiptId,
      p_provenance: input.actor.provenance,
    })
    if (error) fail('ensure document link', error)
    const row = oneRow(data)
    if (!row) fail('ensure document link', { message: 'no row returned' })
    return mapDocumentLink(row)
  }

  async attachReceiptWithDocumentation(
    input: Parameters<BookkeepingRepository['attachReceiptWithDocumentation']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'attach_bookkeeping_receipt_journey',
      {
        p_bookkeeping_record_id: input.recordId,
        p_receipt_id: input.receiptId,
      }
    )
    if (error) fail('attach receipt with documentation history', error)
    const row = oneRow(data)
    if (!row) fail('attach receipt with documentation history', { message: 'no row returned' })
    return mapDocumentLink(row)
  }

  async revokeDocumentLink(input: Parameters<BookkeepingRepository['revokeDocumentLink']>[0]) {
    const { data, error } = await this.supabase
      .from('bookkeeping_document_links')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: input.actor.userId,
        revocation_reason: input.reason,
      })
      .eq('business_id', input.actor.businessId)
      .eq('id', input.linkId)
      .select('*')
      .single()
    if (error) fail('revoke document link', error)
    return mapDocumentLink(data)
  }


  async revokeReceiptLinkWithDocumentation(
    input: Parameters<BookkeepingRepository['revokeReceiptLinkWithDocumentation']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'revoke_bookkeeping_receipt_journey',
      {
        p_document_link_id: input.linkId,
        p_reason: input.reason,
      }
    )
    if (error) fail('revoke receipt with documentation history', error)
    const row = oneRow(data)
    if (!row) fail('revoke receipt with documentation history', { message: 'no row returned' })
    return mapDocumentLink(row)
  }

  async listCurrentReviewItems(businessId: string) {
    const { data: candidates, error: candidateError } = await this.supabase
      .from('bookkeeping_decisions')
      .select('id,bookkeeping_record_id,created_at')
      .eq('business_id', businessId)
      .in('review_status', ['needs_review', 'in_review'])
      .order('created_at', { ascending: true })
    if (candidateError) fail('list review candidates', candidateError)

    const { data: successors, error: successorError } = await this.supabase
      .from('bookkeeping_decisions')
      .select('supersedes_decision_id')
      .eq('business_id', businessId)
      .not('supersedes_decision_id', 'is', null)
    if (successorError) fail('find superseded review decisions', successorError)
    const superseded = new Set(
      ((successors ?? []) as DatabaseRow[])
        .map((row) => nullableString(row, 'supersedes_decision_id'))
        .filter((id): id is string => Boolean(id))
    )

    const currentCandidates = ((candidates ?? []) as DatabaseRow[]).filter(
      (row) => !superseded.has(requiredString(row, 'id'))
    )
    return Promise.all(
      currentCandidates.map(async (candidate) => {
        const recordId = requiredString(candidate, 'bookkeeping_record_id')
        const decisionId = requiredString(candidate, 'id')
        const [record, decision] = await Promise.all([
          this.findRecord(businessId, recordId),
          this.findDecisionById(businessId, decisionId),
        ])
        if (!record || !decision) {
          fail('map review queue', { message: 'current review item is missing' })
        }
        return { record, decision }
      })
    )
  }

  async openReviewIssue(input: Parameters<WeeklyReviewRepository['openReviewIssue']>[0]) {
    const { data, error } = await this.supabase.rpc('open_bookkeeping_review_issue_v2', {
      p_business_id: input.businessId,
      p_bookkeeping_record_id: input.recordId,
      p_based_on_decision_id: input.decisionId,
      p_reason: input.reason,
      p_issue_key: input.issueKey,
      p_context_fingerprint: input.contextFingerprint,
      p_question_context: input.questionContext ?? null,
    })
    if (error) fail('open bookkeeping review issue', error)
    return this.requireReviewEvent(input.businessId, data)
  }

  async skipReviewIssue(input: Parameters<WeeklyReviewRepository['skipReviewIssue']>[0]) {
    const { data, error } = await this.supabase.rpc('skip_bookkeeping_review_issue', {
      p_business_id: input.businessId,
      p_review_issue_id: input.issueId,
      p_expected_current_event_id: input.expectedCurrentEventId,
      p_deferred_until: input.deferredUntil,
    })
    if (error) fail('skip bookkeeping review issue', error)
    return this.requireReviewEvent(input.businessId, data)
  }

  async resolveReviewIssue(input: Parameters<WeeklyReviewRepository['resolveReviewIssue']>[0]) {
    const { data, error } = await this.supabase.rpc('resolve_bookkeeping_review_issue', {
      p_business_id: input.businessId,
      p_review_issue_id: input.issueId,
      p_expected_current_event_id: input.expectedCurrentEventId,
    })
    if (error) fail('resolve bookkeeping review issue', error)
    return this.requireReviewEvent(input.businessId, data)
  }

  async reopenReviewIssue(input: Parameters<WeeklyReviewRepository['reopenReviewIssue']>[0]) {
    const { data, error } = await this.supabase.rpc('reopen_bookkeeping_review_issue', {
      p_business_id: input.businessId,
      p_review_issue_id: input.issueId,
      p_expected_current_event_id: input.expectedCurrentEventId,
      p_based_on_decision_id: input.decisionId,
      p_context_fingerprint: input.contextFingerprint,
    })
    if (error) fail('reopen bookkeeping review issue', error)
    return this.requireReviewEvent(input.businessId, data)
  }

  async listCurrentWeeklyReviewItems(businessId: string, asOf: string) {
    const { data, error } = await this.supabase.rpc('list_current_bookkeeping_review_issues', {
      p_business_id: businessId,
      p_as_of: asOf,
    })
    if (error) fail('list current bookkeeping review issues', error)
    return Promise.all(
      ((data ?? []) as DatabaseRow[]).map(async (row) => {
        const event = mapWeeklyReviewEvent(row)
        const [record, decision] = await Promise.all([
          this.findRecord(businessId, event.bookkeepingRecordId),
          this.findDecisionById(businessId, event.basedOnDecisionId),
        ])
        if (!record || !decision) {
          fail('map bookkeeping review issue', {
            message: 'review issue record or decision is missing',
          })
        }
        return { record, decision, event }
      })
    )
  }

  async answerBusinessPurpose(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    answer: BusinessPurposeAnswer
  }): Promise<StoredReviewAnswerResult> {
    const { data, error } = await this.supabase.rpc(
      'answer_bookkeeping_business_purpose_review_issue',
      {
        p_review_issue_id: input.reviewIssueId,
        p_expected_current_event_id: input.expectedCurrentEventId,
        p_expected_current_decision_id: input.expectedCurrentDecisionId,
        p_expected_context_fingerprint: input.expectedContextFingerprint,
        p_expected_evidence_fingerprint: input.expectedEvidenceFingerprint,
        p_answer: input.answer,
      }
    )
    if (error) fail('answer bookkeeping business-purpose review issue', error)
    const result = oneRow(data)
    if (!result) fail('answer bookkeeping business-purpose review issue', { message: 'no result returned' })
    const businessId = requiredString(result, 'business_id')
    const [answeredEvent, resolvedEvent, decision] = await Promise.all([
      this.loadReviewEvent(businessId, requiredString(result, 'answered_event_id')),
      this.loadReviewEvent(businessId, requiredString(result, 'resolved_event_id')),
      this.findDecisionById(businessId, requiredString(result, 'decision_id')),
    ])
    if (!decision) fail('answer bookkeeping business-purpose review issue', { message: 'decision is missing' })
    return { answeredEvent, resolvedEvent, decision, followUpEvent: null }
  }

  async answerMealSubstantiation(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    attendeeRelationship: string
  }) {
    const { data, error } = await this.supabase.rpc('answer_bookkeeping_meal_substantiation_issue', {
      p_review_issue_id: input.reviewIssueId,
      p_expected_current_event_id: input.expectedCurrentEventId,
      p_expected_current_decision_id: input.expectedCurrentDecisionId,
      p_expected_context_fingerprint: input.expectedContextFingerprint,
      p_expected_evidence_fingerprint: input.expectedEvidenceFingerprint,
      p_attendee_relationship: input.attendeeRelationship,
    })
    if (error) fail('answer meal substantiation issue', error)
    return data
  }

  async answerBusinessUse(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    answer: BusinessUseAnswer
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_business_use_review_issue',
      'answer bookkeeping business-use review issue',
      input
    )
  }

  async answerMixedUse(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    answer: MixedUseAmountAnswer
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_mixed_use_review_issue',
      'answer bookkeeping mixed-use review issue',
      input
    )
  }

  async answerMixedUsePercentage(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    businessPercentage: string
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_mixed_use_percentage',
      'answer bookkeeping mixed-use percentage',
      { ...input, answer: { schemaVersion: 1, businessPercentage: input.businessPercentage } }
    )
  }

  async answerCustomerNotSure(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_customer_not_sure',
      'record customer Not sure answer',
      { ...input, answer: { schemaVersion: 1, response: 'not_sure' } }
    )
  }

  async answerMixedUseAllBusiness(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_mixed_use_all_business',
      'record all-business mixed-use answer',
      { ...input, answer: { schemaVersion: 1, scope: 'all_business' } }
    )
  }

  async answerMixedUsePersonalAmount(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    personalAmountCents: number
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_mixed_use_personal_amount',
      'record mixed-use personal amount',
      { ...input, answer: {
        schemaVersion: 1,
        personalAmountCents: input.personalAmountCents,
      } }
    )
  }

  async answerTransactionType(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    answer: TransactionTypeAnswer
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_transaction_type_review_issue',
      'answer bookkeeping transaction-type review issue',
      input
    )
  }

  async answerConflictingEvidence(input: {
    reviewIssueId: string
    expectedCurrentEventId: string
    expectedCurrentDecisionId: string
    expectedContextFingerprint: string
    expectedEvidenceFingerprint: string
    expectedConflictFingerprint: string
    answer: ConflictingEvidenceAnswer
  }): Promise<StoredReviewAnswerResult> {
    return this.answerReviewRpc(
      'answer_bookkeeping_conflicting_evidence_review_issue',
      'answer bookkeeping conflicting-evidence review issue',
      input,
      { p_expected_conflict_fingerprint: input.expectedConflictFingerprint }
    )
  }

  async openConflictingEvidence(input: TrustedConflictQuestion) {
    const { data, error } = await this.supabase.rpc(
      'open_bookkeeping_conflicting_evidence_issue',
      {
        p_business_id: input.businessId,
        p_bookkeeping_record_id: input.recordId,
        p_based_on_decision_id: input.decisionId,
        p_conflict_key: input.conflictKey,
        p_prompt: input.prompt,
        p_allow_none_of_these: input.allowNoneOfThese ?? false,
        p_options: input.options,
      }
    )
    if (error) fail('open conflicting-evidence review issue', error)
    return this.requireReviewEvent(input.businessId, data)
  }

  async openDocumentationRequest(
    input: Parameters<DocumentationRepository['openDocumentationRequest']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'open_bookkeeping_documentation_request',
      {
        p_business_id: input.businessId,
        p_bookkeeping_record_id: input.recordId,
        p_reason: input.reason,
        p_issue_key: input.issueKey,
        p_context_fingerprint: input.contextFingerprint,
        p_question_context: input.questionContext,
      }
    )
    if (error) fail('open bookkeeping documentation request', error)
    return this.requireDocumentationEvent(input.businessId, data)
  }

  async markReceiptLost(
    input: Parameters<DocumentationRepository['markReceiptLost']>[0]
  ): Promise<ReceiptLostResult> {
    const { data, error } = await this.supabase.rpc(
      'mark_bookkeeping_receipt_lost',
      {
        p_documentation_issue_id: input.issueId,
        p_expected_current_event_id: input.expectedCurrentEventId,
        p_expected_context_fingerprint: input.expectedContextFingerprint,
        p_expected_evidence_fingerprint: input.expectedEvidenceFingerprint,
        p_assertion: input.answer,
      }
    )
    if (error) fail('mark bookkeeping receipt lost', error)
    const row = oneRow(data)
    if (!row) fail('mark bookkeeping receipt lost', { message: 'no result returned' })
    const businessId = requiredString(row, 'business_id')
    const [receiptLostEvent, resolvedEvent] = await Promise.all([
      this.loadDocumentationEvent(
        businessId,
        requiredString(row, 'receipt_lost_event_id')
      ),
      this.loadDocumentationEvent(
        businessId,
        requiredString(row, 'resolved_event_id')
      ),
    ])
    return { receiptLostEvent, resolvedEvent }
  }

  async reopenDocumentationRequest(
    input: Parameters<DocumentationRepository['reopenDocumentationRequest']>[0]
  ) {
    const { data, error } = await this.supabase.rpc(
      'reopen_bookkeeping_documentation_request',
      {
        p_business_id: input.businessId,
        p_documentation_issue_id: input.issueId,
        p_expected_current_event_id: input.expectedCurrentEventId,
        p_context_fingerprint: input.contextFingerprint,
        p_question_context: input.questionContext,
      }
    )
    if (error) fail('reopen bookkeeping documentation request', error)
    return this.requireDocumentationEvent(input.businessId, data)
  }

  async listOutstandingDocumentationRequests(businessId: string) {
    const { data, error } = await this.supabase.rpc(
      'list_current_bookkeeping_documentation_requests',
      { p_business_id: businessId }
    )
    if (error) fail('list bookkeeping documentation requests', error)
    return ((data ?? []) as DatabaseRow[]).map(mapDocumentationEvent)
  }

  private async answerReviewRpc(
    functionName: string,
    operation: string,
    input: {
      reviewIssueId: string
      expectedCurrentEventId: string
      expectedCurrentDecisionId: string
      expectedContextFingerprint: string
      expectedEvidenceFingerprint: string
      answer: BusinessUseAnswer | MixedUseAmountAnswer | TransactionTypeAnswer |
        ConflictingEvidenceAnswer | Record<string, unknown>
    },
    extraParameters: Record<string, unknown> = {}
  ): Promise<StoredReviewAnswerResult> {
    const { data, error } = await this.supabase.rpc(functionName, {
      p_review_issue_id: input.reviewIssueId,
      p_expected_current_event_id: input.expectedCurrentEventId,
      p_expected_current_decision_id: input.expectedCurrentDecisionId,
      p_expected_context_fingerprint: input.expectedContextFingerprint,
      p_expected_evidence_fingerprint: input.expectedEvidenceFingerprint,
      p_answer: input.answer,
      ...extraParameters,
    })
    if (error) fail(operation, error)
    const result = oneRow(data)
    if (!result) fail(operation, { message: 'no result returned' })
    const businessId = requiredString(result, 'business_id')
    const followUpEventId = nullableString(result, 'follow_up_event_id')
    const [answeredEvent, resolvedEvent, decision, followUpEvent] =
      await Promise.all([
        this.loadReviewEvent(
          businessId,
          requiredString(result, 'answered_event_id')
        ),
        this.loadReviewEvent(
          businessId,
          requiredString(result, 'resolved_event_id')
        ),
        this.findDecisionById(
          businessId,
          requiredString(result, 'decision_id')
        ),
        followUpEventId
          ? this.loadReviewEvent(businessId, followUpEventId)
          : Promise.resolve(null),
      ])
    if (!decision) fail(operation, { message: 'decision is missing' })
    return { answeredEvent, resolvedEvent, decision, followUpEvent }
  }

  private async requireReviewEvent(businessId: string, value: unknown) {
    if (typeof value !== 'string') {
      fail('load bookkeeping review event', { message: 'no id returned' })
    }
    return this.loadReviewEvent(businessId, value)
  }

  private async requireDocumentationEvent(businessId: string, value: unknown) {
    if (typeof value !== 'string') {
      fail('load bookkeeping documentation event', { message: 'no id returned' })
    }
    return this.loadDocumentationEvent(businessId, value)
  }

  private async loadDocumentationEvent(businessId: string, eventId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_documentation_events')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', eventId)
      .single()
    if (error) fail('load bookkeeping documentation event', error)
    return mapDocumentationEvent(data)
  }

  private async loadReviewEvent(businessId: string, eventId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_review_events')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', eventId)
      .single()
    if (error) fail('load bookkeeping review event', error)
    return mapWeeklyReviewEvent(data)
  }

  private async findDecisionById(businessId: string, decisionId: string) {
    const { data, error } = await this.supabase
      .from('bookkeeping_decisions')
      .select('*')
      .eq('business_id', businessId)
      .eq('id', decisionId)
      .maybeSingle()
    if (error) fail('find bookkeeping decision', error)
    if (!data) return null
    const { data: allocationRows, error: allocationError } = await this.supabase
      .from('bookkeeping_allocations')
      .select('allocation_kind,amount_cents,tax_category_key,memo')
      .eq('business_id', businessId)
      .eq('bookkeeping_decision_id', decisionId)
    if (allocationError) fail('find bookkeeping allocations', allocationError)
    return mapDecision(
      data,
      ((allocationRows ?? []) as DatabaseRow[]).map((row) => ({
        kind: requiredString(row, 'allocation_kind') as BookkeepingDecisionInput['allocations'][number]['kind'],
        amountCents: Number(row.amount_cents),
        taxCategoryKey: nullableString(row, 'tax_category_key'),
        memo: nullableString(row, 'memo'),
      }))
    )
  }
}

export function createSupabaseBookkeepingRepository(supabase: SupabaseClient) {
  return new SupabaseBookkeepingRepository(supabase)
}

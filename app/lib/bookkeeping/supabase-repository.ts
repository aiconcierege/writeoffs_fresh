import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BookkeepingActor,
  BookkeepingDecisionInput,
  CanonicalBookkeepingRecord,
  CanonicalRecordInput,
  DocumentationLink,
  FinancialSourceEvidence,
  StoredBookkeepingDecision,
} from './model'
import type { BookkeepingRepository } from './service'

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

export class SupabaseBookkeepingRepository implements BookkeepingRepository {
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

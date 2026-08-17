import type { AutomatedDecisionProposal } from './model'
import { CanonicalBookkeepingService, type BookkeepingRepository } from './service'

export async function applyAutomatedBookkeepingDecision(input: {
  repository: BookkeepingRepository
  businessId: string
  recordId: string
  expectedCurrentDecisionId: string
  proposal: AutomatedDecisionProposal
}) {
  const service = new CanonicalBookkeepingService(input.repository)
  return service.recordAutomatedDecision({
    businessId: input.businessId,
    recordId: input.recordId,
    expectedCurrentDecisionId: input.expectedCurrentDecisionId,
    proposal: input.proposal,
  })
}

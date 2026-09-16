import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const processing = readFileSync('app/lib/bookkeeping/weekly-review-processing.ts', 'utf8');
const questions = readFileSync('app/questions/page.tsx', 'utf8');
const workflowRoute = readFileSync('app/api/bookkeeping/reviews/[id]/workflow/route.ts', 'utf8');
const weeklyReadModel = readFileSync('app/lib/bookkeeping/weekly-review.ts', 'utf8');
const periodActionRoute = readFileSync('app/api/bookkeeping/reviews/[id]/route.ts', 'utf8');
describe('retained weekly-review history compatibility', () => {
    it('keeps legacy question URLs on the continuous check-in and final presentation gated', () => {
        expect(questions).toContain("redirect('/check-in')");
        expect(processing).toContain("stage==='final'");
        expect(processing).toContain('if(!workflowReady)');
        expect(processing).toContain('unresolvedQuestionCount:questions');
        expect(processing).toContain('supersededWorkflowEvents');
        expect(processing).toContain('periodRecordIds(loaded.records');
        expect(weeklyReadModel).toContain('supersededWorkflowEvents');
        expect(processing).not.toContain('if(!grouped.size)return false');
    });
    it('uses one Betti speaking position and renders only the active stage', () => {
        const page = readFileSync('app/weekly-review/[id]/page.tsx', 'utf8');
        expect(page).not.toContain('<BettiIllustration');
        expect(page).toContain("redirect('/check-in')");
        expect(page).not.toContain('Weekly review ·');
    });
    it('uses canonical business-dollar mixed-use answers and blocks percentage input', () => {
        const flow = readFileSync('app/questions/QuestionFlow.tsx', 'utf8');
        expect(flow).toContain("action: 'mixed_business_amount', businessAmountCents: enteredCents");
        expect(flow).not.toContain("action: 'mixed_personal_amount'");
        expect(flow).toContain("question.kind === 'percentage' && embedded");
        expect(flow).toContain('Keep this on my list and continue');
        expect(flow).toContain("!(embedded && question.kind === 'percentage')");
    });
    it('collects the missing meal relationship as a real-world fact', () => {
        const flow = readFileSync('app/questions/QuestionFlow.tsx', 'utf8');
        expect(flow).toContain("question.kind === 'meal_relationship'");
        expect(flow).toContain('Who was the meal with?');
        expect(flow).toContain("action: 'meal_relationship', attendeeRelationship: mealRelationship");
        expect(flow).not.toContain('Who was the meal with, where was it, what date was it, and how much was it?');
    });
    it('carries unresolved limitations into the immutable summary without trapping the customer', () => {
        expect(processing).toContain('unresolvedQuestionCount:questions');
        expect(processing).toContain('p_unresolved_question_count:input.unresolvedQuestionCount');
        expect(processing).not.toContain('if(!workflowReady||questions>0)');
        expect(weeklyReadModel).toContain('unresolvedQuestionCount:Number(snapshot.data.unresolved_question_count??0)');
    });
    it('opens canonical missing-documentation requests before entering that stage', () => {
        expect(workflowRoute).toContain('ensurePeriodDocumentationRequests');
        expect(workflowRoute).toContain("open_bookkeeping_documentation_request");
        expect(workflowRoute).toContain("p_reason:'MISSING_SUPPORTING_DOCUMENTATION'");
        expect(workflowRoute).toMatch(/if\(stage==='documentation'\)[\s\S]*?await ensurePeriodDocumentationRequests/);
    });
    it('keeps canonical defer compatibility without exposing it in the normal final review', () => {
        expect(periodActionRoute).toContain("!['confirmed','deferred'].includes(body.action)");
        expect(periodActionRoute).toContain("state:body.action");
    });
    it('binds both customer outcomes to the exact presented snapshot', () => {
        expect(periodActionRoute).toContain("['presented','correction_linked'].includes(current.data.event_type)");
        expect(periodActionRoute).toContain('current.data.review_snapshot_id!==body.snapshotId');
        expect(periodActionRoute).toContain("p_event_type:body.action");
    });
    it('keeps simple final corrections inside the review and links them to immutable history', () => {
        expect(weeklyReadModel).toContain('latestDecisionId');
        expect(weeklyReadModel).toContain('presentedItems');
    });
    it('does not reopen a deferred review as an unfinished workflow on refresh', () => {
        expect(weeklyReadModel).toContain("if(leaf?.event_type==='deferred')continue");
        expect(weeklyReadModel).toContain("['confirmed','closed_unreviewed'].includes(leaf.event_type)");
    });
});

import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const page=readFileSync('app/check-in/page.tsx','utf8')
const flow=readFileSync('app/questions/QuestionFlow.tsx','utf8')
const policy=readFileSync('app/lib/route-policy.ts','utf8')

describe('continuous Check in with Betti experience',()=>{
  it('loads the authoritative queue without a Weekly Review period or date range',()=>{
    expect(page).toContain('loadCurrentCustomerWork')
    expect(page).toContain('experience="check-in"')
    expect(page).not.toMatch(/weekly|periodStart|periodEnd|reviewId/i)
  })

  it('is protected by the authenticated route policy',()=>{
    expect(policy).toContain("'/check-in'")
    expect(page).toContain("redirect('/login')")
    expect(page).toContain("redirect('/membership/read-only')")
  })

  it('posts through the canonical action API then reloads the authoritative queue',()=>{
    const post=flow.indexOf('method: \'POST\'')
    const reload=flow.indexOf('await reloadAuthoritativeQueue()',post)
    expect(post).toBeGreaterThan(-1)
    expect(reload).toBeGreaterThan(post)
    expect(flow).toContain("fetch('/api/bookkeeping/questions',{cache:'no-store',signal:AbortSignal.timeout(15_000)})")
  })

  it('reloads safely when the answer version is stale',()=>{
    expect(flow).toContain('if(response.status===409)await reloadAuthoritativeQueue()')
    expect(flow).toContain("'if-match': question.version")
  })

  it('bounds network waits and offers safe queue recovery',()=>{
    expect(flow).toContain('AbortSignal.timeout(15_000)')
    expect(flow).toContain('Reload current question')
    expect(flow).toContain('await reloadAuthoritativeQueue()')
  })

  it('renders conversational entry and zero-question states without a weekly date header',()=>{
    expect(flow).toContain('Check in with Betti')
    expect(flow).toContain('question-identity')
    expect(flow).toContain('More waiting')
    expect(flow).not.toContain('Question {answered + 1} of {total}</p>{!embedded&&<Link')
    expect(flow).toContain('workMessage?.heading')
    expect(flow).not.toContain('I’ll keep working in the background.')
  })

  it('retains newly returned questions and dependent follow-ups instead of slicing an old list',()=>{
    expect(flow).toContain('reconcileQuestionSession(previous, currentQuestions(queueResult.questions!), completedVersions.current,followUp)')
    expect(flow).toContain("experience!=='check-in'&&initialQuestions.length>0")
    expect(flow).not.toContain('setQuestions((value) => value.slice(1))\n      setPurpose')
  })
})

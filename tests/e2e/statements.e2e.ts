import {createHash,randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {expect,test} from '@playwright/test'
import {PDFDocument,StandardFonts} from 'pdf-lib'

const url=process.env.LOCAL_SUPABASE_URL,anonKey=process.env.LOCAL_SUPABASE_ANON_KEY,serviceKey=process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY
const workerSecret=process.env.BOOKKEEPING_WORKER_SECRET
const enabled=process.env.RUN_LOCAL_STATEMENT_E2E==='1'&&Boolean(url&&anonKey&&serviceKey&&workerSecret)
test.skip(!enabled,'requires explicitly enabled local Supabase statement E2E')

test('statement survives departure, imports once, and remains usable on mobile',async({page})=>{
  const admin=createClient(url!,serviceKey!,{auth:{persistSession:false,autoRefreshToken:false}}),email=`statement-browser-${randomUUID()}@example.test`,password=`Local-${randomUUID()}-password`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const userId=created.data.user!.id
  try{
    const seededBusiness=(await admin.from('businesses').select('id').eq('owner_user_id',userId).single()).data!
    const grant=await admin.rpc('create_business_membership_grant',{p_business_id:seededBusiness.id,p_plan:'business',p_starts_at:new Date().toISOString(),p_ends_at:null,p_request_key:`statement-e2e:${randomUUID()}`,p_reason:'Statement browser test',p_provenance:'local_setup',p_actor_user_id:null});expect(grant.error).toBeNull()
    await page.goto('/login');await page.getByPlaceholder('you@example.com').fill(email);await page.getByPlaceholder('Your password').fill(password)
    await page.getByRole('button',{name:'Log in'}).click();await page.waitForURL('**/home');await page.goto('/import')
    await expect(page.getByRole('heading',{name:'Bank or card statements'})).toBeVisible();const pdf=await statementPdf()
    const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload statements'}).click();await (await chooser).setFiles({name:'browser-checking.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)})
    await expect(page.getByRole('status')).toContainText('received');await page.goto('/home')
    const business=(await admin.from('businesses').select('id').eq('owner_user_id',userId).single()).data!
    await expect.poll(async()=>{const drain=await page.request.post('/api/internal/processing/drain',{headers:{authorization:`Bearer ${workerSecret}`}});expect(drain.ok()).toBe(true);const job=(await admin.from('receipt_processing_jobs').select('state,last_error_code,attempt_count').eq('business_id',business.id).eq('job_type','statement_inspection').single()).data;if(job&&['dead_letter','unreadable','needs_attention'].includes(job.state))throw new Error(`Statement worker stopped: ${job.state}/${job.last_error_code??'unknown'}`);return (await admin.from('financial_transactions').select('id').eq('business_id',business.id).eq('import_method','statement')).data?.length??0},{timeout:20_000,intervals:[0,250,500,1_000]}).toBe(1)
    await page.goto('/import');await expect(page.getByText('Organized',{exact:true})).toBeVisible();await expect(page.getByText(/1 transactions/)).toBeVisible()
    await page.goto('/transactions');await expect(page.getByText('CLIENT PAYMENT')).toBeVisible()
    await page.goto('/reports');await expect(page.getByRole('heading',{name:'Your business at a glance'})).toBeVisible()
    await page.goto('/import');const duplicateChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload statements'}).click();await (await duplicateChooser).setFiles({name:'browser-checking-copy.pdf',mimeType:'application/pdf',buffer:Buffer.from(pdf)})
    await expect(page.getByRole('status')).toContainText('already added')
    expect((await admin.from('financial_transactions').select('id').eq('business_id',business.id).eq('import_method','statement')).data).toHaveLength(1)
    await page.setViewportSize({width:390,height:844});await page.reload();await expect(page.getByRole('button',{name:'Upload statements'})).toBeVisible()
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  }finally{await admin.auth.admin.deleteUser(userId)}
})

async function statementPdf(){const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]),font=await pdf.embedFont(StandardFonts.Helvetica)
  ;['Browser Bank','Account ending in 4242','Statement Period: 03/01/2026 - 03/31/2026','Beginning balance $100.00','03/05/2026 CLIENT PAYMENT DEPOSIT +25.00','Ending balance $125.00']
    .forEach((line,index)=>page.drawText(line,{x:48,y:740-index*28,size:12,font}));const bytes=await pdf.save();expect(createHash('sha256').update(bytes).digest('hex')).toHaveLength(64);return bytes}

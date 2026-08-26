import{expect,test}from'@playwright/test'

const email=process.env.STAGING_REALTOR_EMAIL,password=process.env.STAGING_REALTOR_PASSWORD
test.skip(process.env.RUN_STAGING_REALTOR_E2E!=='1'||!email||!password,'requires designated staging realtor fixture credentials')

test('established realtor customer surfaces render from canonical staging data',async({page})=>{
 const errors:Error[]=[];page.on('pageerror',error=>errors.push(error))
 await page.goto('/login');await page.getByPlaceholder('you@example.com').fill(email!);await page.getByPlaceholder('Your password').fill(password!)
 await page.getByRole('button',{name:'Log in'}).click();await page.waitForURL('**/home')
 await expect(page.getByRole('heading',{name:/209 potential writeoffs found this year/})).toBeVisible()
 await expect(page.getByText(/I have 20 quick questions/)).toBeVisible()
 for(const route of ['/transactions','/questions','/receipts','/reports','/mileage','/invoices']){
  const response=await page.goto(route);expect(response?.status(),route).toBeLessThan(400);await expect(page.locator('main').first()).toBeVisible()
 }
 await page.goto('/home');await expect(page.getByText('Your weekly check-in')).toBeVisible()
 await page.setViewportSize({width:390,height:844});await page.reload()
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 expect(errors).toEqual([])
})

import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL
const vercelBypass = process.env.PLAYWRIGHT_VERCEL_BYPASS

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 45_000,
  fullyParallel: false,
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3100',
    extraHTTPHeaders: vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer:externalBaseUrl?undefined:{command:'npm run dev -- -p 3100',url:'http://127.0.0.1:3100',reuseExistingServer:true,
    timeout:120_000,env:{...process.env,NEXT_PUBLIC_ENABLE_SIGNUP:'true'}},
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})

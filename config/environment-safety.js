const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', 'host.docker.internal'])
const ENVIRONMENTS = new Set(['local', 'staging', 'production'])

function parsedUrl(value) {
  if (!value) return null
  try { return new URL(value) } catch { return null }
}

function isLocalSupabaseUrl(value) {
  const url = parsedUrl(value)
  return Boolean(url && LOCAL_SUPABASE_HOSTS.has(url.hostname))
}

function required(env, names) {
  const missing = names.filter((name) => !env[name])
  if (missing.length) throw new Error(`Missing required ${env.WRITEOFFS_ENVIRONMENT} configuration: ${missing.join(', ')}.`)
}

function assertExpectedSupabaseHost(env) {
  const publicUrl = parsedUrl(env.NEXT_PUBLIC_SUPABASE_URL)
  const serverUrl = parsedUrl(env.SUPABASE_URL)
  const expected = env.WRITEOFFS_EXPECTED_SUPABASE_HOST
  if (!publicUrl || !serverUrl || publicUrl.protocol !== 'https:' || serverUrl.protocol !== 'https:') {
    throw new Error('Remote Supabase URLs must be valid HTTPS URLs.')
  }
  if (publicUrl.hostname !== serverUrl.hostname || publicUrl.hostname !== expected) {
    throw new Error('Supabase URLs do not match WRITEOFFS_EXPECTED_SUPABASE_HOST.')
  }
  if (isLocalSupabaseUrl(publicUrl.toString())) throw new Error('A remote environment cannot use local Supabase.')
}

function validateEnvironment(env = process.env) {
  const name = env.WRITEOFFS_ENVIRONMENT || 'local'
  if (!ENVIRONMENTS.has(name)) throw new Error('WRITEOFFS_ENVIRONMENT must be local, staging, or production.')

  const plaidMode = env.PLAID_ENV || 'sandbox'
  const stripeMode = env.WRITEOFFS_STRIPE_MODE || 'test'
  if (name !== 'production' && plaidMode === 'production') throw new Error('Plaid Production is forbidden outside the production environment.')
  if (name !== 'production' && stripeMode === 'live') throw new Error('Stripe live mode is forbidden outside the production environment.')

  if (env.NODE_ENV === 'development' && name === 'local') {
    const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
    if (url && !isLocalSupabaseUrl(url) && env.ALLOW_REMOTE_SUPABASE_IN_DEV !== 'true') {
      throw new Error('Local development is pointed at a remote Supabase project. Use local Supabase or explicitly set ALLOW_REMOTE_SUPABASE_IN_DEV=true.')
    }
  }

  if (name === 'staging') {
    required(env, ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'WRITEOFFS_EXPECTED_SUPABASE_HOST'])
    assertExpectedSupabaseHost(env)
  }

  if (name === 'production') {
    required(env, [
      'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY', 'WRITEOFFS_EXPECTED_SUPABASE_HOST', 'NEXT_PUBLIC_BASE_URL',
      'MFA_ENFORCEMENT_MODE', 'CRON_SECRET', 'DOCUMENT_EXPENSIVE_PROCESSING_ENABLED',
      'STRIPE_MEMBERSHIP_ENABLED', 'PLAID_PRODUCTION_ENABLED',
    ])
    assertExpectedSupabaseHost(env)
    const origin = parsedUrl(env.NEXT_PUBLIC_BASE_URL)
    if (!origin || origin.protocol !== 'https:' || LOCAL_SUPABASE_HOSTS.has(origin.hostname) || origin.pathname !== '/') {
      throw new Error('Production NEXT_PUBLIC_BASE_URL must be an HTTPS origin with no path.')
    }
    if (env.MFA_ENFORCEMENT_MODE !== 'required') throw new Error('Production requires mandatory MFA enrollment and challenge.')
    if ((env.CRON_SECRET || '').length < 32) throw new Error('Production CRON_SECRET must contain at least 32 characters.')
    if (!['true', 'false'].includes(env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED)) throw new Error('DOCUMENT_EXPENSIVE_PROCESSING_ENABLED must be explicit in production.')
    if (env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED === 'true') required(env, ['GCV_API_KEY'])
    if (env.RECEIPT_UNDERSTANDING_ENABLED === 'true') required(env, ['RECEIPT_UNDERSTANDING_PROVIDER', 'RECEIPT_UNDERSTANDING_MODEL', 'OPENAI_API_KEY'])

    if (env.STRIPE_MEMBERSHIP_ENABLED === 'true') {
      required(env, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_EXPENSES_PRICE_ID', 'STRIPE_BUSINESS_PRICE_ID', 'STRIPE_PORTAL_CONFIGURATION_ID'])
      if (stripeMode !== 'live' || !env.STRIPE_SECRET_KEY.startsWith('sk_live_')) throw new Error('Enabled production memberships require Stripe live mode and a live secret.')
    } else if (env.STRIPE_MEMBERSHIP_ENABLED !== 'false') {
      throw new Error('STRIPE_MEMBERSHIP_ENABLED must be true or false in production.')
    }

    if (env.PLAID_PRODUCTION_ENABLED === 'true') {
      required(env, ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_TOKEN_ENCRYPTION_KEY', 'PLAID_WEBHOOK_URL'])
      if (plaidMode !== 'production') throw new Error('Enabled production Plaid requires PLAID_ENV=production.')
    } else if (env.PLAID_PRODUCTION_ENABLED === 'false') {
      if (env.PLAID_SANDBOX_LINK_ENABLED === 'true') throw new Error('Plaid Sandbox Link cannot be enabled in production.')
    } else {
      throw new Error('PLAID_PRODUCTION_ENABLED must be true or false in production.')
    }
  }

  return {
    name,
    plaidMode,
    productionPlaidEnabled: name === 'production' && env.PLAID_PRODUCTION_ENABLED === 'true',
    stripeMode,
    expensiveProcessingEnabled: env.DOCUMENT_EXPENSIVE_PROCESSING_ENABLED !== 'false',
  }
}

module.exports = { isLocalSupabaseUrl, validateEnvironment }

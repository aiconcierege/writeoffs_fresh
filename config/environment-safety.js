const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', 'host.docker.internal'])

function isLocalSupabaseUrl(value) {
  if (!value) return false
  try { return LOCAL_SUPABASE_HOSTS.has(new URL(value).hostname) } catch { return false }
}

function validateEnvironment(env = process.env) {
  const name = env.WRITEOFFS_ENVIRONMENT || 'local'
  if (!['local', 'staging', 'production'].includes(name)) {
    throw new Error('WRITEOFFS_ENVIRONMENT must be local, staging, or production.')
  }
  if (env.NODE_ENV === 'development' && name === 'local') {
    const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
    if (url && !isLocalSupabaseUrl(url) && env.ALLOW_REMOTE_SUPABASE_IN_DEV !== 'true') {
      throw new Error('Local development is pointed at a remote Supabase project. Use local Supabase or explicitly set ALLOW_REMOTE_SUPABASE_IN_DEV=true.')
    }
  }
  if (name === 'production' && env.PLAID_ENV && env.PLAID_ENV !== 'production') {
    // Production deployment may deliberately remain Sandbox-only before approval.
    return { name, plaidMode: env.PLAID_ENV, productionPlaidEnabled: false }
  }
  return { name, plaidMode: env.PLAID_ENV || 'sandbox', productionPlaidEnabled: name === 'production' && env.PLAID_ENV === 'production' }
}

module.exports = { isLocalSupabaseUrl, validateEnvironment }

// Safe, shared customer language for Home and Bank connections. No provider error
// text or credentials belong in either surface.
export type BankConnectionAttentionInput = {
  connection_status: string
  update_reason?: string | null
  new_accounts_available?: boolean
}
export function bankConnectionAttention(connection: BankConnectionAttentionInput) {
  if (connection.connection_status === 'disconnected') return null
  if (connection.update_reason === 'ITEM_LOGIN_REQUIRED' || connection.update_reason === 'USER_PERMISSION_REVOKED' || connection.connection_status === 'reconnect_required') {
    return { message: 'Your bank needs you to reconnect.', action: 'Reconnect bank' }
  }
  if (connection.update_reason === 'PENDING_EXPIRATION' || connection.update_reason === 'PENDING_DISCONNECT') {
    return { message: 'Your bank connection needs to be renewed.', action: 'Renew connection' }
  }
  if (connection.new_accounts_available) return { message: 'Your bank has more accounts available.', action: 'Review accounts' }
  // A sync/documentation issue or an account no longer shared is not proof that
  // credential repair is needed. Don't trap the customer in repeated Link.
  if (connection.update_reason === 'USER_ACCOUNT_REVOKED') return null
  return null
}

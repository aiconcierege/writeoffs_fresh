import type { PlaidGateway } from './types'

/** A retry after successful provider removal must still finish local cleanup. */
export async function removePlaidItemIdempotently(gateway: PlaidGateway, accessToken: string) {
  try {
    await gateway.removeItem(accessToken)
  } catch (error) {
    const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code
    if (code !== 'ITEM_NOT_FOUND') throw error
  }
}

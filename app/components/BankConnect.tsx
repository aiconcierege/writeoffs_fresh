"use client";

/**
 * Bank connections are intentionally unavailable while WriteOffs moves to a
 * provider-neutral banking foundation. Historical Teller data remains intact,
 * but new Teller enrollments are deprecated and blocked server-side.
 */
export default function BankConnect() {
  return (
    <button
      type="button"
      disabled
      aria-describedby="bank-connect-status"
      className="inline-flex cursor-not-allowed items-center rounded-md bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600"
    >
      Bank connections temporarily unavailable
    </button>
  );
}

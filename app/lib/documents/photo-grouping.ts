/** Customer-supplied document grouping, never authority for financial facts.
 * Stored in the immutable upload; extraction must still establish all amounts,
 * dates and merchant facts and reject conflicting complete receipts. */
export const CUSTOMER_PHOTO_GROUPING = 'WriteOffs: customer grouped these photos as one receipt or document (v1)'

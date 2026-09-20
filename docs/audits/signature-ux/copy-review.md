# Betti copy review

Exact presentation-only replacements. Canonical command meanings, scope and evidence requirements are unchanged.

| Before | After | Source |
| --- | --- | --- |
| Is anything here personal? | Anything here personal? | `app/components/guided/GuidedWork.tsx` |
| How were these purchases used? | Which of these were for business? | `app/components/guided/GuidedWork.tsx` |
| Is anything partly personal? | Anything partly personal? | `app/components/guided/GuidedWork.tsx` |
| Is that all the receipts you have? | Any more receipts for these? | `app/components/guided/GuidedWork.tsx` |
| I’m treating these as business because this is your business-only account. Tell me if anything was personal. | I’m treating these as business because this is your business-only account. | `app/components/guided/GuidedWork.tsx` |
| Choose the use of each purchase. For anything mixed, tell me the business dollars—I’ll handle the split. | This account has business and personal activity. For anything partly personal, tell me how much was for business. | `app/components/guided/GuidedWork.tsx` |
| Select any partly personal purchases and enter the business dollars. Leave the others unselected. | Select anything partly personal and tell me how much was for business. | `app/components/guided/GuidedWork.tsx` |
| Send me the ones you have and I’ll match them. | Send me what you have and I’ll match them. | `app/components/guided/GuidedWork.tsx` |
| This applies only to these purchases. Missing receipts won’t remove supported expenses. | If not, that’s okay. I’ll keep working with what I have. | `app/components/guided/GuidedWork.tsx` |
| I’ll send receipts later | I’ll do this later | `app/components/guided/GuidedWork.tsx` |
| I have another receipt to send | I have another receipt | `app/components/guided/GuidedWork.tsx` |
| That’s all the receipts I have | That’s all I have | `app/components/guided/GuidedWork.tsx` |
| Save personal exceptions | These were personal | `app/components/guided/GuidedWork.tsx` |
| Save these facts | That’s right | `app/components/guided/GuidedWork.tsx` |
| Save business portions | Use these amounts | `app/components/guided/GuidedWork.tsx` |
| Your original is safe. Open the document to see what will help me read it. | Open the document to see what I need to read it. | `app/components/guided/GuidedWork.tsx` |
| Saving your account choice… | Got it… | `app/components/guided/GuidedWork.tsx` |
| Waiting to review your records | I’ll keep working from here | `app/components/guided/GuidedWork.tsx` |
| I’m missing receipts for N purchases. | Do you have receipts for these? | `app/components/guided/GuidedWork.tsx` |
| Got it. I’ve saved what you told me. | Got it. | `app/components/guided/conversation-status.ts` |
| Your answer is saved. | Got it. | `app/questions/QuestionFlow.tsx` |
| Got it. Your answer is saved with this transaction. | Got it. | `app/questions/QuestionFlow.tsx` |
| I’ve saved your answers with this week’s records. | I’ll keep working from here. | `app/questions/QuestionFlow.tsx` |
| Got it. I linked this return to its purchase. | Got it. I matched the refund to that purchase. | `app/components/SpecialTransactionFlow.tsx` |
| This looks like a refund. I need you to confirm the original purchase. | This looks like a refund. Help me match it to the purchase. | `app/components/SpecialTransactionFlow.tsx` |
| How much of this return was for the business portion? | How much of this refund was for business? | `app/components/SpecialTransactionFlow.tsx` |
| Send the expense and reimbursement records so Betti can establish what this repaid. No business income or expense reversal has been assumed. | Send me the expense and reimbursement records so I can see what was repaid. | `app/components/SpecialTransactionFlow.tsx` |
| I couldn’t finish organizing it. Your document is safe—let’s take a look. | I couldn’t finish reading it. Let’s see what’s missing. | `app/lib/home/command-center.ts` |
| Your records are safe. | I still have some records to review. | `app/lib/home/command-center.ts` |
| Some work needs another look before I can finish. There’s nothing you need to answer right now. | There’s nothing I need you to answer right now. I haven’t finished reviewing everything yet. | `app/lib/home/command-center.ts` |
| You’re done for now. | You’re all set for now. | `app/lib/home/command-center.ts` |
| The things you set aside are saved for later. Your available working numbers are below. | I saved the things you want to come back to. I’ll keep working with what I have. | `app/lib/home/command-center.ts` |
| Your current bookkeeping scope stays unchanged. | Your books still begin on the same date. | `app/lib/home/command-center.ts` |
| I’ve kept the earlier evidence, but it isn’t part of your active books. | Earlier records aren’t included in these books. | `app/lib/home/command-center.ts` |
| What did the insurance cover? | What did this insurance cover? | `app/lib/bookkeeping/customer-questions.ts` |
| I can see this was money coming in, but I can’t tell where it came from. | I can see money came in, but I can’t tell where it came from. | `app/lib/bookkeeping/customer-questions.ts` |
| Choose what happened. I’ll handle the bookkeeping rules. | Tell me what this payment was for. | `app/lib/bookkeeping/customer-questions.ts` |
| Confirm what happened. I’ll handle the bookkeeping rules. | (removed) | `app/lib/bookkeeping/customer-questions.ts` |
| I know this is your phone bill. I just need to know how much was for business. | I know this is your phone bill. | `app/lib/bookkeeping/customer-questions.ts` |
| For example: office work, materials for a customer job, or products you sell. Tell me the use, not an accounting category. | For example: office work, materials for a customer job, or products you sell. | `app/lib/bookkeeping/customer-questions.ts` |
| Tell WriteOffs what you bought or why you needed it. | Tell me what you bought or why you needed it. | `app/lib/bookkeeping/customer-questions.ts` |
| A supporting record may help me understand this. | A document may help me understand this. | `app/components/SpecialTransactionFlow.tsx` |
| I recorded that you’re not sure. The activity remains unresolved; supporting records can help establish it. | That’s okay. Send me a document when you have one, and I’ll take another look. | `app/components/SpecialTransactionFlow.tsx` |
| Got it. I linked this return to the purchase. Both records and their history are kept. | Got it. I matched the refund to that purchase. | `app/components/SpecialTransactionFlow.tsx` |
| Got it. I saved that fact. | Got it. | `app/components/SpecialTransactionFlow.tsx` |
| I need more evidence before I can finish this. Send the payment, purchase or reimbursement record you have. | Send me the payment, purchase or reimbursement record you have. | `app/components/SpecialTransactionFlow.tsx` |
| Different tax year — needs tax-treatment review | From a different year. I’ll need to check the tax details. | `app/components/SpecialTransactionFlow.tsx` |
| Send the original purchase or return record. I’ll keep this unresolved until the relationship is supported. | Send me the original purchase or refund record so I can match them. | `app/components/SpecialTransactionFlow.tsx` |
| This return reduces the supported business and personal portions of the original purchase. It is not business revenue. | I matched this refund to the original purchase. It won’t count as new income. | `app/components/SpecialTransactionFlow.tsx` |
| Choose statement | Send statement | `app/components/SpecialTransactionFlow.tsx` |
| Enter the business dollars. I’ll handle the split. | Tell me how much was for business. | `app/questions/QuestionFlow.tsx` |
| I’ll turn that into an exact dollar split. | I’ll work out the amount. | `app/questions/QuestionFlow.tsx` |
| Choose the factual payment method. WriteOffs will evaluate reporting implications separately. | Tell me how you paid them. | `app/lib/bookkeeping/customer-questions.ts` |
| I’m checking the latest state of your books. | I’m checking your books. | `app/components/guided/GuidedWork.tsx` |
| Please refresh this group. | This list has changed. Refresh to see it. | `app/components/guided/GuidedWork.tsx` |
| Send me your financial activity. | Send me your statements. | `app/components/guided/GuidedWork.tsx` |
| No customer question is available for this activity. | There’s nothing I need you to answer about this right now. | `app/components/guided/GuidedWork.tsx` |
| Review without more receipts | I don’t have any to send | `app/components/guided/GuidedWork.tsx` |
| Got it. I’m updating your books. | I’m updating your books. | `app/components/guided/conversation-status.ts` |

## Retained deliberately

- Principal versus interest explanation: tells the customer why a loan statement is necessary.
- Business-only account explanation: explains the batch assumption and exception choice.
- Meal attendees and business-purpose examples: collects material facts without guessing.
- W-9 sensitive-data warning: prevents customers entering sensitive identifiers in an answer.
- Receipt upload/received/matched distinctions: truthful progress rather than claiming successful matching early.
- Timeout and stale-action errors: explain safe recovery rather than implying an uncertain write failed.
- Broad choices for genuinely unknown economic nature; narrow confirmation when canonical evidence supplies it.

See `copy-inventory.json` for retained literal and dynamic-template strings, with classification. Persisted data-authored prompts remain authoritative; no migration rewrites already-presented action versions.

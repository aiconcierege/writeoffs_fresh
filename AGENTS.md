# WriteOffs.io Repository Instructions

## 1. Product owner

- Rick is the founder and product owner.
- Do not make major product-direction changes without explicit approval.
- Do not invent new product scope, workflows, pricing, tax features, or user-facing behavior.

## 2. Work autonomously on routine engineering

- You may inspect code, edit files, refactor, remove dead code, fix straightforward bugs, update tests, and improve maintainability.
- You may run tests, typecheck, lint, builds, `git diff`, `git status`, and other normal repository-local development commands without asking first.
- When a routine technical issue is discovered, investigate and fix it when the correct solution is reasonably clear.
- Do not stop after every small task. Continue through the logical work plan unless you hit a real decision point.

## 3. Validation

- After meaningful changes, run the relevant validation checks.
- Prefer existing project scripts.
- Do not claim work is complete if tests, typecheck, lint, or build are failing because of your changes.
- Clearly distinguish pre-existing warnings from new failures.

## 4. Safety and production

- Do not deploy to production.
- Do not push to remote Git repositories unless explicitly instructed.
- Do not merge pull requests.
- Do not make destructive production database changes.
- Do not delete production data.
- Do not rotate, expose, or modify secrets unless explicitly instructed.
- Do not make billing, Stripe, Plaid, Supabase account, DNS, Vercel account, or other external-service changes without approval.
- Repository-local migrations may be created when appropriate, but do not execute destructive production migrations.

## 5. Git discipline

- Preserve unrelated user changes.
- Do not use destructive Git commands such as `reset --hard`, `checkout -- .`, `clean -fd`, or force push unless explicitly instructed.
- Review `git diff` before considering work complete.
- Keep changes scoped to the assigned task.

## 6. WriteOffs product constraints

- WriteOffs is a deduction-first bookkeeping platform for U.S. solopreneurs.
- It prepares users for tax filing; it does not file tax returns.
- Do not generate tax returns or official tax forms.
- Realtor is the primary launch vertical, with General as the fallback.
- Do not reintroduce user-facing category selection unless explicitly directed.
- Mileage tracking is not part of the initial product.
- Teller is retired and must not be reintroduced as an active provider.
- Future bank connectivity is intended to use Plaid.
- Preserve historical Teller compatibility only when genuinely required for legacy-data handling or migration.
- Maintain the Milestone 1 security model, tenant isolation, RLS protections, business provisioning, provider-neutral financial accounts, and immutable financial transaction principles.

## 7. When to stop and ask

Stop and ask Rick only when:

- A genuine product decision is required.
- Multiple materially different architectures have important tradeoffs.
- An action could destroy or irreversibly alter production data.
- Credentials, money, contracts, external accounts, deployment, or legal/tax positioning are involved.
- The requested work conflicts with these standing instructions.
- Requirements are materially ambiguous and choosing incorrectly would affect users.

Otherwise, use sound engineering judgment and continue.

## 8. Communication

- Explain final results simply, assuming Rick is not a software engineer.
- Report what changed, what validation was run, any remaining warnings/issues, and any decision Rick actually needs to make.
- Avoid unnecessary jargon.
- Do not ask Rick to perform routine coding steps that you can perform yourself.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

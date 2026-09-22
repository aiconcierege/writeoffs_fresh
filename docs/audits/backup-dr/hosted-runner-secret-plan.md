# Temporary hosted DR runner credential — proposed

Status: explicitly approved by Rick and securely stored in `staging-backup` on September 22, 2026.

## Approved external change

Add one temporary environment secret:

- Repository: `aiconcierege/writeoffs_fresh`
- Environment: `staging-backup`
- Name: `WRITEOFFS_TEMP_DR_TARGET_JSON`
- Target: `hkvmfbqshqthsfxmwlsq`, `writeoffs-dr-certification-20260922`

Contents are limited to that newly created, disposable synthetic target's database
password, private recovery API credentials, retired public keys needed for denial
probes, target/connection identifiers, and public TLS CA certificate. There are no
AWS credentials, deletion-ledger encryption keys, primary application credentials,
Supabase management tokens, or real customer data in this secret.

The prepared transfer reads the target's private local provisioning record and
passes the JSON directly to `gh secret set` through standard input. No value is
printed, supplied on a command line, or placed in an artifact. It refuses to overwrite
an existing secret and verifies the required reviewer and sole staging branch before
publishing. Its read-only preparation check passed, and the approved transfer completed without displaying the value.

The protected runner needs this credential to perform the hosted restore while the
existing ledger key stays in protected GitHub storage. The `staging-dr-recovery`
environment remains restricted to its three approved secrets; it is not changed.

## Lifetime and cleanup

Use only in the explicitly reviewed hosted DR workflow on `v2-onboarding-staging`.
Do not attach it to ordinary backup, application, deployment, or Production jobs.
Remove it after the hosted drill and delete the disposable project. Removing the
project invalidates its credentials. Preserve only sanitized evidence.

## Current target status

The project has no Auth users and no application tables. It contains one private
synthetic isolation canary. No real customer records or backup have been restored.
Public Auth/REST denial, private-object customer denial, controller object access,
and full TLS database access have been verified independently. Those checks are
preparation, **not the full hosted resurrection/restore certification**.

Provider billing API confirms Micro at $0.01344/hour, with no paid add-ons.
Approved cumulative budget remains $25. Actual invoice has not been verified.

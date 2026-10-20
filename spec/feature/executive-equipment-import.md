# Cc executive equipment intake

ID: SPEC-BB-EXECUTIVE-IMPORT-001

Equipment additions originate from a human executive instruction received by Cc.
The AI prepares a JSON list; a trusted, local signing CLI reads the original Cc
message and current staff roster, verifies the Discord source identity and
executive role, and signs the prepared list together with its source reference.
The signer is an operator tool, never an HTTP endpoint. Its private Ed25519 key
comes from Vault injection; AWS receives only the public verification key.

The signature attests that the trusted intake operator converted the referenced
instruction. It does not prove semantic equivalence of arbitrary natural-language
instructions and the converted list: the operator must compare them before signing.
Do not sign unrelated instructions, AI/system messages, or a requester inferred
only from a display name. Unsupported source formats fail closed.

The AWS import CLI verifies the signature and 24-hour expiry, inserts all items in
one transaction, and records the batch digest, original instruction digest and
Discord author/reference. Replaying an identical batch is idempotent. Existing
equipment identifiers are never overwritten. Ordinary equipment POST endpoints
return 403 even for administrators; book registration and loans are unchanged.
No equipment is created until the executive supplies the actual list.

Operator commands (one-off Node/tsx CLI; never a separate service):
- `node --import tsx server/cli/sign-equipment.ts --input <list.json> --output <signed.json> --session <Cc session> --message <Cc message id>`
- `node --import tsx server/cli/import-equipment.ts --input <signed.json>`

The signer requires `CONCORDIA_URL` (trusted local Cc URL from its catalog) and
`BIBLIOTHECA_IMPORT_SIGNING_KEY` (PEM). The importer requires
`BIBLIOTHECA_IMPORT_PUBLIC_KEY` (PEM) and `BIBLIOTHECA_DATA` (absolute existing
primary-service data directory). Keys must never be passed as CLI arguments or
saved in the repository. Every item requires a stable `qr_code`, `name`, and
optional `spec`. Resolve ambiguous quantities or identities before importing.

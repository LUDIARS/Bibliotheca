# AWS deployment

ID: SPEC-BB-AWS-001

Bibliotheca runs from the AWS primary checkout through Excubitor. Setup installs
the Vestigium submodule first, then application dependencies and the web bundle.
Required URLs come from Excubitor/Vault. Setup never launches a process.

Service-data transfer is separate from adding equipment. Export uses SQLite's
consistent backup API and a versioned Bibliotheca-only JSON envelope. Import
verifies SHA-256 and database integrity, rejects an existing destination database,
and clears short-lived return tokens. Excubitor must stop the service for transfer.
The source and bundle are retained until the operator verifies the destination.
No secrets or environment files are transferred.

Equipment intake policy (neco, 2026-10-20): additions originate only from executive
instructions received through Cc, then AI converts the supplied list for import.
Browser forms and ordinary administrator APIs are not approved intake paths.
The importer must verify the Cc instruction's author against the Cc staff roster,
retain the source reference and batch digest, and reject duplicate/conflicting
additions. This bootstrap does not claim to implement that authorization path.

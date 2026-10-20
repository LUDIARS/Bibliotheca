# SPEC-BB-HOLDINGS-001: Explicit book holdings

Bibliotheca owns lending and ownership references, not bibliographic metadata.
The book_holding table stores only ISBN, registration time and registering user ID.
Titles remain external MasterSource metadata cached in item_meta_cache.

Authenticated GET /api/items/books returns explicitly registered holdings and current loan status.
Administrator POST /api/items/books accepts an ISBN, resolves its metadata and records ownership.
Repeated registration is idempotent. Unresolved ISBNs do not create holdings.
Lookup and legacy bulk cache warming do not imply ownership and never populate holdings.

Migration is additive and idempotent, leaving existing loans, equipment and caches unchanged.
Existing ISBN-level lending supports one active loan per ISBN; this change does not invent copy counts.
GLab consumes this API alongside the existing equipment API. Club budget is owned by GLab.

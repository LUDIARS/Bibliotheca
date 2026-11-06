# Fixed backend Composite SDK

Eight unchanged TypeScript backend modules and MIT license from accepted Cernere commit `71d6c368dc188bbb95f9af323d347060425d99d6`. `source-pin.json` records each SHA-256. Regenerate only after source review with `node scripts/vendor-composite.mjs <reviewed-local-Cernere-repository>`; the script reads fixed Git objects without hooks, network, installs or source execution.

The existing tsx runtime resolves relative `.js` specifiers to the adjacent TypeScript sources. No frontend/UI dependency or new npm package is required. Authentication remains in the shared SDK and Cernere authority; this directory is not a separate verifier implementation.

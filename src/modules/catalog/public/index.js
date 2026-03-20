// Node.js (CJS) smoke-test shim.
// This exists so `node -e "require('./src/modules/catalog/public')"` succeeds without
// loading TypeScript, DB drivers, or other side-effectful dependencies.
module.exports = {}


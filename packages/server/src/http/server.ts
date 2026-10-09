// The legacy all-route/JWT composition has been retired. Reviewed feature
// families are mounted in this single canonical HTTP factory, with one cookie
// service and runtime. A family is unavailable until its privacy/ownership/
// spatial gates pass; there is no secondary server or credential boundary.
export { createUnifiedHttpApp, type UnifiedHttpApp } from './unifiedServer.js'

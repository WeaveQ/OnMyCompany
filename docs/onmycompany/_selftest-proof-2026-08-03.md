# Self-test proof 2026-08-03T12:46:05.679Z

- **health**: `GET /api/company/health` → **200** ✅
  `{"ok":true,"companyModule":true,"orgId":"default","orgConfigRoot":"/Users/work/code/weaveq/onmycompany/data/org/default/config","orgConfigReady":true,"version":"0.1.0-m0"}`
- **public**: `GET /api/catalog/skills?scope=public` → **200** ✅
  `{"items":[{"packageId":"omc-demo-report@0.1.0","name":"Demo Report","visibility":"public","skillCount":1,"source":"seed","createdAt":"1970-01-01T00:00:00.000Z","added":false},{"pac`
- **enable**: `POST /api/org/skills/enable` → **200** ✅
  `{"ok":true,"entry":{"packageId":"omc-hello@1.0.0","ref":"registry/public/omc-hello@1.0.0","source":"seed","enabledAt":"2026-08-03T12:46:05.669Z","enabledBy":"7ee7c1737eba99dfb33d19`
- **org**: `GET /api/catalog/skills?scope=org` → **200** ✅
  `{"items":[{"packageId":"omc-hello@1.0.0","name":"Hello Team","visibility":"public","skillCount":1,"source":"seed","createdAt":"1970-01-01T00:00:00.000Z","added":true}]}`
- **upload**: `POST /api/org/skills/upload` → **200** ✅
  `{"ok":true,"meta":{"packageId":"smoke-upload@0.1.0","name":"Smoke Upload","visibility":"public","skillCount":1,"ownerMemberId":"7ee7c1737eba99dfb33d1969","source":"upload","created`
- **policy**: `PUT /api/org/config/policy` → **200** ✅
  `{"ok":true,"manifest":{"version":"cfg-1","updatedAt":"2026-08-03T12:46:05.676Z","schemaVersion":1,"orgId":"default"}}`
- **runtime-token**: `POST /api/company/runtime-tokens` → **200** ✅
  `{"ok":true,"token":"oct_7tiScnEa0BoTdcL3dIf6o3WuzIZN7ecVmcfrBQ7UktU","tokenId":"df22f64f-a2e3-4a16-97a2-d6bbd5604f19","memberId":"7ee7c1737eba99dfb33d1969"}`
- **me**: `GET /api/me` → **200** ✅
  `{"authenticated":true,"memberId":"7ee7c1737eba99dfb33d1969","displayName":"admin","email":"admin@company.internal","roles":["admin"],"orgId":"default"}`

**Overall:** PASS

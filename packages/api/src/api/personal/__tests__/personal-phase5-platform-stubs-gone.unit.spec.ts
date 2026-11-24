// personal-phase5-platform-stubs-gone.unit.spec.ts
// Verifies that all /personal/platform/* routes return 410 Gone after Aşama 5 migration
import * as PlatformRoot from "../platform/route"
import * as PlatformSmtp from "../platform/smtp/route"
import * as PlatformStores from "../platform/stores/route"
import * as PlatformStoreRenames from "../platform/store-renames/route"
import * as PlatformStoreNameTransfers from "../platform/store-name-transfers/route"
import * as PlatformStoreClosings from "../platform/store-closings/route"
import * as PlatformStoreClosingReviews from "../platform/store-closing-reviews/route"
import * as PlatformStoreClosingEmailReadiness from "../platform/store-closing-email-readiness/route"
import * as PlatformStoreApplicationPolicy from "../platform/store-application-policy/route"
import * as PlatformLauncher from "../platform/launcher/route"

const makeRes = () => {
  const res: any = { statusCode: 200, body: null }
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (body: any) => { res.body = body; return res }
  return res
}
const makeReq = (method = "GET") =>
  ({ method, headers: {}, query: {}, body: {} }) as any

const stubs = [
  { label: "/personal/platform", mod: PlatformRoot, hasPost: true, target: "/platform/" },
  { label: "/personal/platform/smtp", mod: PlatformSmtp, hasPost: true, target: "/platform/smtp" },
  { label: "/personal/platform/stores", mod: PlatformStores, hasPost: true, target: "/platform/stores" },
  { label: "/personal/platform/store-renames", mod: PlatformStoreRenames, hasPost: true, target: "/platform/store-renames" },
  { label: "/personal/platform/store-name-transfers", mod: PlatformStoreNameTransfers, hasPost: true, target: "/platform/store-name-transfers" },
  { label: "/personal/platform/store-closings", mod: PlatformStoreClosings, hasPost: true, target: "/platform/store-closings" },
  { label: "/personal/platform/store-closing-reviews", mod: PlatformStoreClosingReviews, hasPost: true, target: "/platform/store-closing-reviews" },
  { label: "/personal/platform/store-closing-email-readiness", mod: PlatformStoreClosingEmailReadiness, hasPost: false, target: "/platform/store-closing-email-readiness" },
  { label: "/personal/platform/store-application-policy", mod: PlatformStoreApplicationPolicy, hasPost: true, target: "/platform/store-application-policy" },
  { label: "/personal/platform/launcher", mod: PlatformLauncher, hasPost: true, target: "/platform/launcher" },
]

describe("Phase 5: /personal/platform/* stubs return 410 Gone", () => {
  for (const { label, mod, hasPost, target } of stubs) {
    describe(label, () => {
      it("AUTHENTICATE is false", () => {
        expect(mod.AUTHENTICATE).toBe(false)
      })
      it("GET returns 410 with correct message", async () => {
        const res = makeRes()
        await (mod as any).GET(makeReq("GET"), res)
        expect(res.statusCode).toBe(410)
        expect(res.body?.message).toContain(target)
      })
      if (hasPost) {
        it("POST returns 410 with correct message", async () => {
          const res = makeRes()
          await (mod as any).POST(makeReq("POST"), res)
          expect(res.statusCode).toBe(410)
          expect(res.body?.message).toContain(target)
        })
      }
    })
  }
})

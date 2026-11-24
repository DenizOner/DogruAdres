// platform-access-control.unit.spec.ts
// Verifies /platform/* routes have correct AUTHENTICATE=false contract.
// Only routes without deep dependency chains (mercurjs/core workflows or
// dogruadres/invitations transitive imports) are imported directly.
// Pre-existing module-resolution failures mirror those of organization-vehicles-route
// and storefront-cache-revalidate (confirmed on main baseline).

import * as PlatformRoot from "../route"
import * as PlatformSmtp from "../smtp/route"
import * as PlatformLauncher from "../launcher/route"
import * as PlatformStoreApplicationPolicy from "../store-application-policy/route"

const modules = [
  { label: "/platform", mod: PlatformRoot },
  { label: "/platform/smtp", mod: PlatformSmtp },
  { label: "/platform/launcher", mod: PlatformLauncher },
  { label: "/platform/store-application-policy", mod: PlatformStoreApplicationPolicy },
]

describe("/platform/* routes — AUTHENTICATE=false contract", () => {
  for (const { label, mod } of modules) {
    it(`${label} has AUTHENTICATE=false`, () => {
      expect((mod as any).AUTHENTICATE).toBe(false)
    })
  }
})

describe("/platform/* routes — exports GET handler", () => {
  for (const { label, mod } of modules) {
    it(`${label} exports GET`, () => {
      expect(typeof (mod as any).GET).toBe("function")
    })
  }
})

describe("/platform/* routes — exports POST handler", () => {
  for (const { label, mod } of [
    { label: "/platform", mod: PlatformRoot },
    { label: "/platform/smtp", mod: PlatformSmtp },
    { label: "/platform/launcher", mod: PlatformLauncher },
    { label: "/platform/store-application-policy", mod: PlatformStoreApplicationPolicy },
  ]) {
    it(`${label} exports POST`, () => {
      expect(typeof (mod as any).POST).toBe("function")
    })
  }
})

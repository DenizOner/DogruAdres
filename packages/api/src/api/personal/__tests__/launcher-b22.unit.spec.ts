import { GET, POST } from "../launcher/route"
// Keep approved B20 suites in the existing Foundation selected Jest gate.
// The workflow owns its file selection; do not modify the shared #263 runner.
import "./company-launcher.unit.spec"
import "../../../modules/dogruadres-access/__tests__/company-launcher.unit.spec"

describe("B22 personal launcher is disabled pending Organization-scoped B20", () => {
  it.each([["GET", GET], ["POST", POST]] as const)(
    "%s denies Person-only preferences without loading native or Foundation data",
    async (_method, handler) => {
      const req: any = { scope: { resolve: jest.fn() } }
      const res: any = {
        setHeader: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }
      await handler(req, res)
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store")
      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: "Company workspace required" })
      expect(req.scope.resolve).not.toHaveBeenCalled()
    }
  )
})

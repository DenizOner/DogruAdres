// 410 Gone stubs for personal/* routes moved to organization/* in Aşama 2 (#482)
import { GET as memGET, POST as memPOST } from "../memberships/route"
import { GET as invGET, POST as invPOST } from "../invitations/route"
import { GET as launchGET, POST as launchPOST } from "../company-launcher/route"
import { GET as auditGET } from "../audit-timeline/route"
import { GET as notifGET, POST as notifPOST } from "../notifications/route"

function makeRes() {
  const res: any = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() }
  return res
}
const req: any = { headers: {}, query: {}, body: {} }

describe("personal route stubs return 410 Gone after Aşama 2 migration", () => {
  it("GET /personal/memberships → 410 Moved to /organization/memberships", async () => {
    const res = makeRes()
    await memGET(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith({ message: "Moved to /organization/memberships" })
  })

  it("POST /personal/memberships → 410 Moved to /organization/memberships", async () => {
    const res = makeRes()
    await memPOST(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
  })

  it("GET /personal/invitations → 410 Moved to /organization/invitations", async () => {
    const res = makeRes()
    await invGET(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith({ message: "Moved to /organization/invitations" })
  })

  it("POST /personal/invitations → 410 Moved to /organization/invitations", async () => {
    const res = makeRes()
    await invPOST(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
  })

  it("GET /personal/company-launcher → 410 Moved to /organization/launcher", async () => {
    const res = makeRes()
    await launchGET(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith({ message: "Moved to /organization/launcher" })
  })

  it("POST /personal/company-launcher → 410 Moved to /organization/launcher", async () => {
    const res = makeRes()
    await launchPOST(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
  })

  it("GET /personal/audit-timeline → 410 Moved to /organization/audit-timeline", async () => {
    const res = makeRes()
    await auditGET(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith({ message: "Moved to /organization/audit-timeline" })
  })

  it("GET /personal/notifications → 410 Moved to /organization/notifications", async () => {
    const res = makeRes()
    await notifGET(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
    expect(res.json).toHaveBeenCalledWith({ message: "Moved to /organization/notifications" })
  })

  it("POST /personal/notifications → 410 Moved to /organization/notifications", async () => {
    const res = makeRes()
    await notifPOST(req, res)
    expect(res.status).toHaveBeenCalledWith(410)
  })
})

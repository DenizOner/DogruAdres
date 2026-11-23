// #482 Aşama 4: Verifies /personal/catalog|buyer-context|buyer-permissions|order-groups|return-requests
// routes return 410 Gone after phase 4 migration to /organization/*.

import { GET as catalogGet } from '../../personal/catalog/route'
import { GET as buyerContextGet, POST as buyerContextPost } from '../../personal/buyer-context/route'
import { GET as buyerPermissionsGet, POST as buyerPermissionsPost } from '../../personal/buyer-permissions/route'
import { GET as orderGroupsGet } from '../../personal/order-groups/route'
import { GET as returnRequestsGet } from '../../personal/return-requests/route'

function makeRes() {
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() }
  return res
}
const req: any = {}

describe('/personal/catalog|buyer-*|order-groups|return-requests routes — 410 Gone after Aşama 4 migration', () => {
  describe('/personal/catalog', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await catalogGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/catalog' })
    })
  })

  describe('/personal/buyer-context', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await buyerContextGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/buyer-context' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await buyerContextPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/buyer-permissions', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await buyerPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/buyer-permissions' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await buyerPermissionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/order-groups', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await orderGroupsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/order-groups' })
    })
  })

  describe('/personal/return-requests', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await returnRequestsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/return-requests' })
    })
  })
})

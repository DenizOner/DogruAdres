// #482 Aşama 3: Verifies /personal/store-* routes return 410 Gone after phase 3 migration.
// Ensures old URLs always respond with 410 and the correct moved-to location.

import { GET as storeApplicationsGet, POST as storeApplicationsPost } from '../../personal/store-applications/route'
import { GET as storeFollowsGet, POST as storeFollowsPost } from '../../personal/store-follows/route'
import { POST as storeBuyerBlocksPost } from '../../personal/store-buyer-blocks/route'
import { GET as storeDraftPermissionsGet, POST as storeDraftPermissionsPost } from '../../personal/store-draft-permissions/route'
import { GET as storeOwnerPauseGet, POST as storeOwnerPausePost } from '../../personal/store-owner-pause/route'
import { GET as storeOwnerClosingGet, POST as storeOwnerClosingPost } from '../../personal/store-owner-closing/route'
import { GET as storePlatformClosingGet, POST as storePlatformClosingPost } from '../../personal/store-platform-closing/route'
import { POST as storeEmailVisitPost } from '../../personal/store-platform-closing-email-visit/route'
import { POST as storeFinalReviewPost } from '../../personal/store-platform-closing-final-review/route'
import { GET as storeRenameGet, POST as storeRenamePost } from '../../personal/store-rename-requests/route'
import { POST as storeMemberConnectionsPost } from '../../personal/store-member-connections/route'
import { GET as storePriceGroupsGet, POST as storePriceGroupsPost } from '../../personal/store-price-groups/route'
import { GET as storeProductPermissionsGet, POST as storeProductPermissionsPost } from '../../personal/store-product-permissions/route'
import { GET as organizationStoresGet } from '../../personal/organization-stores/route'

function makeRes() {
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() }
  return res
}
const req: any = {}

describe('/personal/store-* routes — 410 Gone after Aşama 3 migration', () => {
  describe('/personal/store-applications', () => {
    it('GET returns 410 with moved message', async () => {
      const res = makeRes()
      await storeApplicationsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-applications' })
    })
    it('POST returns 410 with moved message', async () => {
      const res = makeRes()
      await storeApplicationsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-follows', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeFollowsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-follows' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeFollowsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-buyer-blocks', () => {
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeBuyerBlocksPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-buyer-blocks' })
    })
  })

  describe('/personal/store-draft-permissions', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeDraftPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeDraftPermissionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-owner-pause', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeOwnerPauseGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-owner-pause' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeOwnerPausePost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-owner-closing', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeOwnerClosingGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-owner-closing' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeOwnerClosingPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-platform-closing', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storePlatformClosingGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-platform-closing' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storePlatformClosingPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-platform-closing-email-visit', () => {
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeEmailVisitPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-platform-closing-email-visit' })
    })
  })

  describe('/personal/store-platform-closing-final-review', () => {
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeFinalReviewPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-platform-closing-final-review' })
    })
  })

  describe('/personal/store-rename-requests', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeRenameGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-rename-requests' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeRenamePost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-member-connections', () => {
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeMemberConnectionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-member-connections' })
    })
  })

  describe('/personal/store-price-groups', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storePriceGroupsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-price-groups' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storePriceGroupsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/store-product-permissions', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await storeProductPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/store-product-permissions' })
    })
    it('POST returns 410', async () => {
      const res = makeRes()
      await storeProductPermissionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
    })
  })

  describe('/personal/organization-stores', () => {
    it('GET returns 410', async () => {
      const res = makeRes()
      await organizationStoresGet(req, res)
      expect(res.status).toHaveBeenCalledWith(410)
      expect(res.json).toHaveBeenCalledWith({ message: 'Moved to /organization/stores' })
    })
  })
})

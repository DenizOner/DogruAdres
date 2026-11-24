// #482 Aşama 4 / #486: organization/catalog route — HTTP contract tests
// Moved from /personal/catalog → /organization/catalog
import { access, enabled, sessionToken } from '../../personal/security'
import { GET } from '../catalog/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))
jest.mock('../../personal/catalog/native-try-list-price', () => ({
  nativeDirectTryListPrice: jest.fn(),
}))
jest.mock('../../personal/catalog/native-group-try-reference', () => ({
  nativeBuyerGroupTryReference: jest.fn(),
}))

import { nativeDirectTryListPrice } from '../../personal/catalog/native-try-list-price'
import { nativeBuyerGroupTryReference } from '../../personal/catalog/native-group-try-reference'

describe('organization catalog route — HTTP contract (moved from /personal/catalog)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const sellerId = 'sel_01M0TESTSELLER1234567890'
  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    mockService = {
      personalBuyerOrganization: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner',
        organization_id: orgId,
      }),
      personalStoreBuyerBlockDecision: jest.fn().mockResolvedValue({
        ownership_verified: true,
        blocked: false,
      }),
      personalBuyerStorePriceGroupIds: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner',
        organization_id: orgId,
        seller_id: sellerId,
        customer_group_ids: [],
      }),
      storeOwnerPauseAcceptingOrders: jest.fn().mockResolvedValue(true),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    ;(nativeDirectTryListPrice as jest.Mock).mockResolvedValue(null)
    ;(nativeBuyerGroupTryReference as jest.Mock).mockResolvedValue(null)
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}` },
      query: { organization_id: orgId },
      body: {},
      scope: {
        resolve: jest.fn((mod: string) => {
          if (mod === 'seller') return { listSellers: jest.fn().mockResolvedValue([]) }
          return { listOffers: jest.fn().mockResolvedValue([]), listProducts: jest.fn().mockResolvedValue([]) }
        }),
      },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  it('GET returns 200 with empty stores for verified buyer with no candidates', async () => {
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(200)
    const payload = (res.json as jest.Mock).mock.calls[0][0]
    expect(payload.organization_id).toBe(orgId)
    expect(payload.stores).toEqual([])
    expect(payload.checkout_ready).toBe(false)
  })

  it('GET returns 503 when feature flag disabled', async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('GET returns 400 when organization_id missing', async () => {
    req.query = {}
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 400 when x-seller-id header present (security gate)', async () => {
    req.headers['x-seller-id'] = 'sel_attacker'
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 403 when buyer organization not found', async () => {
    mockService.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('GET sets correct cache-control headers', async () => {
    await GET(req, res)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Cookie')
    expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow, noarchive')
  })
})

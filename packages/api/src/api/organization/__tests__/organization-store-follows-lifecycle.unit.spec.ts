// #482 Aşama 3: organization/store-follows route — HTTP contract tests
import { access, csrf, enabled, sessionToken } from '../../personal/security'
import { GET, POST } from '../store-follows/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization store-follows route — HTTP contract (moved from /personal/store-follows)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const sellerId = 'sel_01M0TESTSELLER1234567890'
  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    mockService = {
      personalBuyerStoreFollows: jest.fn().mockResolvedValue({
        organization_id: orgId, stores: [{ seller_id: sellerId, version: 1 }]
      }),
      personalBuyerStoreFollowState: jest.fn().mockResolvedValue({ seller_id: sellerId, following: true, version: 1 }),
      personalChangeBuyerStoreFollow: jest.fn().mockResolvedValue({
        organization_id: orgId, seller_id: sellerId, following: true, version: 2
      }),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    const nativeSeller = { listSellers: jest.fn().mockResolvedValue([{ id: sellerId, name: 'Test Store', handle: 'test-store', status: 'open', approved_at: '2024-01-01' }]) }
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}`, 'x-csrf-token': 'valid' },
      query: {},
      body: {},
      scope: { resolve: jest.fn(() => nativeSeller) },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  describe('GET /organization/store-follows', () => {
    it('rejects when authorization header present (browser must not carry Bearer)', async () => {
      req.headers.authorization = 'Bearer token'
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 503 when feature disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('returns store follow list for valid org listing query', async () => {
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(mockService.personalBuyerStoreFollows).toHaveBeenCalledWith(token, orgId, undefined)
    })

    it('returns single follow state when seller_id provided', async () => {
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(mockService.personalBuyerStoreFollowState).toHaveBeenCalledWith(token, orgId, sellerId)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 403 when service returns null (access denied)', async () => {
      mockService.personalBuyerStoreFollowState.mockResolvedValue(null)
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('POST /organization/store-follows', () => {
    it('returns 403 without valid CSRF', async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { action: 'follow', organization_id: orgId, seller_id: sellerId, expected_version: 0 }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 403 when x-seller-id header present', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      req.body = { action: 'follow', organization_id: orgId, seller_id: sellerId, expected_version: 0 }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 400 when query params present', async () => {
      req.query = { extra: 'param' }
      req.body = { action: 'unfollow', organization_id: orgId, seller_id: sellerId, expected_version: 1 }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 200 for successful unfollow (no seller open check needed)', async () => {
      req.body = { action: 'unfollow', organization_id: orgId, seller_id: sellerId, expected_version: 1 }
      await POST(req, res)
      expect(mockService.personalChangeBuyerStoreFollow).toHaveBeenCalledWith(token, req.body)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 409 on follow state conflict', async () => {
      mockService.personalChangeBuyerStoreFollow.mockResolvedValue({ conflict: true })
      req.body = { action: 'unfollow', organization_id: orgId, seller_id: sellerId, expected_version: 1 }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })
  })
})

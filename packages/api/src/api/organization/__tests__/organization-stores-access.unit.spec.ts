// #482 Aşama 3: organization/stores route — HTTP contract tests
// Moved from /personal/organization-stores → /organization/stores
import { access, enabled, sessionToken } from '../../personal/security'
import { GET } from '../stores/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization stores route — HTTP contract (moved from /personal/organization-stores)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const sellerId = 'sel_01M0TESTSELLER1234567890'
  let mockService: any
  let nativeSeller: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    mockService = {
      personalLegalSellerIds: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner', seller_ids: [sellerId]
      }),
      personalStoreRenameCandidateIds: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner', seller_ids: [sellerId]
      }),
      personalActorBinding: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner', actor_id: 'damem_actor', revoked_at: null
      }),
      storeOwnerPauseAcceptingOrders: jest.fn().mockResolvedValue(true),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    nativeSeller = {
      listMembers: jest.fn().mockResolvedValue([{ id: 'damem_actor', is_active: true }]),
      listSellerMembers: jest.fn().mockResolvedValue([{ member_id: 'damem_actor', seller_id: sellerId }]),
      listSellers: jest.fn().mockResolvedValue([{ id: sellerId, name: 'Test Store', status: 'open', approved_at: '2024-01-01' }]),
    }
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}` },
      query: {},
      body: {},
      scope: { resolve: jest.fn(() => nativeSeller) },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  describe('GET /organization/stores', () => {
    it('returns 503 when feature disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('returns 400 when x-seller-id header present', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for invalid organization id format', async () => {
      req.query = { organization: 'bad-id' }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for extra query params', async () => {
      req.query = { organization: orgId, extra: 'param' }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns store list for valid owner', async () => {
      req.query = { organization: orgId }
      await GET(req, res)
      expect(mockService.personalLegalSellerIds).toHaveBeenCalledWith(token, orgId)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({
        organization_id: orgId,
        stores: [{ id: sellerId, name: 'Test Store' }]
      })
    })

    it('returns 403 when no legal seller IDs found', async () => {
      mockService.personalLegalSellerIds.mockResolvedValue(null)
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 403 when actor binding is revoked', async () => {
      mockService.personalActorBinding.mockResolvedValue({ person_id: 'daprs_owner', actor_id: 'damem_actor', revoked_at: '2024-01-01' })
      req.query = { organization: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('supports rename-only scope via purpose=rename query param', async () => {
      nativeSeller.listSellers.mockResolvedValue([{ id: sellerId, name: 'Test Store', status: 'open', approved_at: '2024-01-01' }])
      req.query = { organization: orgId, purpose: 'rename' }
      await GET(req, res)
      expect(mockService.personalStoreRenameCandidateIds).toHaveBeenCalledWith(token, orgId)
    })
  })
})

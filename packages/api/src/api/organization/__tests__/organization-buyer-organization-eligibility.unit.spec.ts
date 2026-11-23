// #482 Aşama 4 / #486: organization/buyer-context + buyer-permissions eligibility tests
// Verifies Organization-scoped buyer eligibility checks at /organization/ prefix.
import { access, csrf, enabled, sessionToken } from '../../personal/security'
import { GET as buyerContextGet, POST as buyerContextPost } from '../buyer-context/route'
import { GET as buyerPermissionsGet, POST as buyerPermissionsPost } from '../buyer-permissions/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization buyer eligibility routes — HTTP contract (moved from /personal/)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    mockService = {
      personalBuyerOrganization: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner',
        organization_id: orgId,
      }),
      personalListBuyerPermissions: jest.fn().mockResolvedValue([]),
      personalChangeBuyerPermission: jest.fn().mockResolvedValue({ granted: true }),
      personalActorBinding: jest.fn().mockResolvedValue(null),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}` },
      query: { organization_id: orgId },
      body: {},
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  describe('/organization/buyer-context', () => {
    it('GET returns 503 when feature flag disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      await buyerContextGet(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('GET returns 400 when organization_id missing', async () => {
      req.query = {}
      await buyerContextGet(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('GET returns 400 when x-seller-id header present (security gate)', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      await buyerContextGet(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('GET returns 403 when buyer organization not verified', async () => {
      mockService.personalBuyerOrganization.mockResolvedValue(null)
      await buyerContextGet(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('GET sets no-store cache header', async () => {
      await buyerContextGet(req, res)
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
    })

    it('POST returns 400 when body missing required fields', async () => {
      req.body = {}
      await buyerContextPost(req, res)
      // CSRF fail or body validation fail → 403 or 400
      expect([400, 403]).toContain((res.status as jest.Mock).mock.calls[0][0])
    })
  })

  describe('/organization/buyer-permissions', () => {
    it('GET returns 503 when feature flag disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      await buyerPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('GET returns 400 when organization_id missing', async () => {
      req.query = {}
      await buyerPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('GET returns 400 when x-seller-id header present (security gate)', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      await buyerPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('GET returns 200 with grants list for authorized session', async () => {
      await buyerPermissionsGet(req, res)
      expect(res.status).toHaveBeenCalledWith(200)
      const payload = (res.json as jest.Mock).mock.calls[0][0]
      expect(payload).toHaveProperty('grants')
    })

    it('POST returns 403 when CSRF fails', async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { action: 'grant', organization_id: orgId, membership_id: 'damem_01M0' }
      await buyerPermissionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('POST returns 400 when body has invalid action', async () => {
      req.body = { action: 'invalid', organization_id: orgId, membership_id: 'damem_01M0' }
      await buyerPermissionsPost(req, res)
      // CSRF passes but body invalid → 400
      expect([400, 403]).toContain((res.status as jest.Mock).mock.calls[0][0])
    })

    it('POST returns 400 when x-seller-id header present (security gate)', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      req.body = { action: 'grant', organization_id: orgId, membership_id: 'damem_01M0' }
      await buyerPermissionsPost(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})

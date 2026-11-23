// #482 Aşama 3: organization/store-draft-permissions route — HTTP contract tests
import { access, csrf, enabled, sessionToken } from '../../personal/security'
import { GET, POST } from '../store-draft-permissions/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization store-draft-permissions route — HTTP contract (moved from /personal/store-draft-permissions)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const membershipId = 'daomem_01M0TESTMEMBERSHIP12345'
  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    mockService = {
      personalListStoreDraftPermissions: jest.fn().mockResolvedValue({
        permissions: [{ membership_id: membershipId, granted: true }]
      }),
      personalChangeStoreDraftPermission: jest.fn().mockResolvedValue({ membership_id: membershipId, granted: true }),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}`, 'x-csrf-token': 'valid' },
      query: {},
      body: {},
      scope: { resolve: jest.fn(() => mockService) },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  describe('GET /organization/store-draft-permissions', () => {
    it('returns 503 when feature disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('returns 400 with x-seller-id header', async () => {
      req.headers['x-seller-id'] = 'sel_attacker'
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 400 for invalid query', async () => {
      req.query = { organization_id: 'invalid' }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns permission list for valid org', async () => {
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(mockService.personalListStoreDraftPermissions).toHaveBeenCalledWith(token, orgId, null)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 403 when service returns null', async () => {
      mockService.personalListStoreDraftPermissions.mockResolvedValue(null)
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('POST /organization/store-draft-permissions', () => {
    it('returns 403 without CSRF', async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { action: 'grant', organization_id: orgId, membership_id: membershipId }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 400 for invalid input', async () => {
      req.body = { action: 'invalid', organization_id: orgId, membership_id: membershipId }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('grants draft permission for valid input', async () => {
      req.body = { action: 'grant', organization_id: orgId, membership_id: membershipId }
      await POST(req, res)
      expect(mockService.personalChangeStoreDraftPermission).toHaveBeenCalledWith(token, req.body)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 403 when service returns null (not an owner)', async () => {
      mockService.personalChangeStoreDraftPermission.mockResolvedValue(null)
      req.body = { action: 'revoke', organization_id: orgId, membership_id: membershipId }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})

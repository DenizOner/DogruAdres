// #482 Aşama 3: organization/store-applications route — HTTP contract tests (key scenarios)
import { access, csrf, enabled, sessionToken } from '../../personal/security'
import { GET, POST } from '../store-applications/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))
jest.mock('@mercurjs/core/workflows', () => ({
  createSellerAccountWorkflow: jest.fn().mockReturnValue({
    run: jest.fn().mockResolvedValue({ result: { id: 'sel_new', status: 'pending_approval', approved_at: null } })
  })
}))

describe('organization store-applications route — HTTP contract (moved from /personal/store-applications)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const appId = 'daapp_' + 'a'.repeat(32)
  let mockService: any
  let nativeSeller: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    nativeSeller = {
      listSellers: jest.fn().mockResolvedValue([{
        id: 'sel_existing', status: 'pending_approval', approved_at: null, status_reason: null
      }]),
      listMembers: jest.fn().mockResolvedValue([{ id: 'damem_01', is_active: true }]),
    }
    mockService = {
      personalStoreApplications: jest.fn().mockResolvedValue({
        organization_id: orgId,
        applications: [{ id: appId, status: 'created', seller_id: 'sel_existing', live_seller_authorized: false }]
      }),
      reserveStoreApplication: jest.fn(),
      claimStoreApplication: jest.fn(),
      personalWithStoreApplicationOwnerLock: jest.fn(),
      personalSaveStoreApplicationDraft: jest.fn(),
      personalPrepareStoreApplicationFromDraft: jest.fn(),
      finishStoreApplication: jest.fn(),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}`, 'x-csrf-token': 'valid' },
      query: {},
      body: {},
      scope: { resolve: jest.fn(() => nativeSeller) },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  describe('GET /organization/store-applications', () => {
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

    it('returns 400 for invalid org id', async () => {
      req.query = { organization_id: 'invalid' }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 403 when service returns null', async () => {
      mockService.personalStoreApplications.mockResolvedValue(null)
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns application list for valid owner', async () => {
      req.query = { organization_id: orgId }
      await GET(req, res)
      expect(mockService.personalStoreApplications).toHaveBeenCalledWith(token, orgId)
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })

  describe('POST /organization/store-applications', () => {
    it('returns 403 without CSRF', async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { organization_id: orgId, application_id: appId, name: 'Test Store', email: 'test@example.com', currency_code: 'usd' }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 400 for invalid application payload', async () => {
      req.body = { organization_id: 'bad', application_id: 'bad' }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns 403 when reserveStoreApplication returns null', async () => {
      mockService.reserveStoreApplication.mockResolvedValue(null)
      req.body = { organization_id: orgId, application_id: appId, name: 'Test Store', email: 'test@example.com', currency_code: 'usd' }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 409 on name_taken conflict', async () => {
      mockService.reserveStoreApplication.mockResolvedValue({ status: 'name_taken' })
      req.body = { organization_id: orgId, application_id: appId, name: 'Test Store', email: 'test@example.com', currency_code: 'usd' }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })
  })
})

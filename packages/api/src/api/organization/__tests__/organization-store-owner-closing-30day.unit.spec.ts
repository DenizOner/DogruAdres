// #482 Aşama 3: organization/store-owner-closing route — HTTP contract tests
import { access, csrf, enabled, sessionToken } from '../../personal/security'
import { GET, POST } from '../store-owner-closing/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  csrf: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization store-owner-closing route — HTTP contract (moved from /personal/store-owner-closing)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const sellerId = 'sel_01M0TESTSELLER1234567890'
  const requestId = 'dasc_' + 'a'.repeat(32)
  let mockService: any
  let req: any
  let res: any

  beforeEach(() => {
    jest.resetAllMocks()
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(csrf as jest.Mock).mockResolvedValue(true)
    ;(sessionToken as jest.Mock).mockReturnValue(token)
    mockService = {
      personalOwnerClosingState: jest.fn().mockResolvedValue({ status: 'active', version: 0 }),
      personalOwnerClosingChange: jest.fn().mockResolvedValue({ status: 'closing', version: 1, due_at: '2025-01-01', replayed: false }),
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

  describe('GET /organization/store-owner-closing', () => {
    it('returns 503 when disabled', async () => {
      ;(enabled as jest.Mock).mockReturnValue(false)
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })

    it('returns 400 when authorization header present', async () => {
      req.headers.authorization = 'Bearer bad'
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('returns closing state for valid owner', async () => {
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(mockService.personalOwnerClosingState).toHaveBeenCalledWith(token, orgId, sellerId)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 403 when service returns null', async () => {
      mockService.personalOwnerClosingState.mockResolvedValue(null)
      req.query = { organization_id: orgId, seller_id: sellerId }
      await GET(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })
  })

  describe('POST /organization/store-owner-closing', () => {
    it('returns 403 without CSRF', async () => {
      ;(csrf as jest.Mock).mockResolvedValue(false)
      req.body = { organization_id: orgId, seller_id: sellerId, action: 'start', request_id: requestId, expected_version: 0, consequences_acknowledged: true }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('returns 400 when start action without consequences_acknowledged', async () => {
      req.body = { organization_id: orgId, seller_id: sellerId, action: 'start', request_id: requestId, expected_version: 0 }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('starts closing for valid input with acknowledgment', async () => {
      req.body = { organization_id: orgId, seller_id: sellerId, action: 'start', request_id: requestId, expected_version: 0, consequences_acknowledged: true }
      await POST(req, res)
      expect(mockService.personalOwnerClosingChange).toHaveBeenCalledWith(token, req.body)
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('returns 409 on conflict', async () => {
      mockService.personalOwnerClosingChange.mockResolvedValue({ status: 'conflict' })
      req.body = { organization_id: orgId, seller_id: sellerId, action: 'start', request_id: requestId, expected_version: 0, consequences_acknowledged: true }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('returns 503 for unexpected outcome status', async () => {
      mockService.personalOwnerClosingChange.mockResolvedValue({ status: 'unknown_status' })
      req.body = { organization_id: orgId, seller_id: sellerId, action: 'start', request_id: requestId, expected_version: 0, consequences_acknowledged: true }
      await POST(req, res)
      expect(res.status).toHaveBeenCalledWith(503)
    })
  })
})

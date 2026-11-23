// #482 Aşama 4 / #486: organization/order-groups route — isolation contract tests
// Verifies Organization-scoped order group isolation at /organization/order-groups prefix.
import { access, enabled, sessionToken } from '../../personal/security'
import { GET } from '../order-groups/route'

jest.mock('../../personal/security', () => ({
  access: jest.fn(),
  enabled: jest.fn(),
  sessionToken: jest.fn(),
}))

describe('organization order-groups route — isolation contract (moved from /personal/order-groups)', () => {
  const token = 'da_test_session_token_12345678901234567890123'
  const orgId = 'daorg_01M0TESTORGANIZATION123456'
  const groupId = 'og_01M0TESTORDERGROUP12345678'
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
      personalActorBinding: jest.fn().mockResolvedValue({
        person_id: 'daprs_owner',
        actor_id: 'cus_01M0TESTCUSTOMER123456789',
        revoked_at: null,
      }),
      personalBuyerCartAttribution: jest.fn().mockResolvedValue(true),
    }
    ;(access as jest.Mock).mockReturnValue(mockService)
    req = {
      headers: { host: '127.0.0.1:19102', cookie: `da_session=${token}` },
      query: { organization_id: orgId, order_group_id: groupId },
      body: {},
      scope: {
        resolve: jest.fn(() => ({
          listCustomers: jest.fn().mockResolvedValue([]),
          listOrderGroups: jest.fn().mockResolvedValue([]),
          listCarts: jest.fn().mockResolvedValue([]),
          graph: jest.fn().mockResolvedValue({ data: [] }),
        })),
      },
    }
    res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() }
  })

  it('GET returns 503 when feature flag disabled', async () => {
    ;(enabled as jest.Mock).mockReturnValue(false)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('GET returns 400 when organization_id missing', async () => {
    req.query = { order_group_id: groupId }
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 400 when order_group_id missing', async () => {
    req.query = { organization_id: orgId }
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 400 when x-seller-id header present (security gate)', async () => {
    req.headers['x-seller-id'] = 'sel_attacker'
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 400 when authorization header present (security gate)', async () => {
    req.headers['authorization'] = 'Bearer fake_token'
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('GET returns 403 when buyer organization not verified', async () => {
    mockService.personalBuyerOrganization.mockResolvedValue(null)
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('GET returns 403 when customer actor binding revoked', async () => {
    mockService.personalActorBinding.mockResolvedValue({
      person_id: 'daprs_owner',
      actor_id: 'cus_01M0TESTCUSTOMER123456789',
      revoked_at: '2026-01-01T00:00:00Z',
    })
    await GET(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('GET sets correct cache-control headers', async () => {
    await GET(req, res)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store')
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Cookie')
    expect(res.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex, nofollow, noarchive')
    expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer')
    expect(res.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff')
  })

  it('GET isolates: cross-organization access denied (organization_id mismatch)', async () => {
    mockService.personalBuyerOrganization.mockResolvedValue({
      person_id: 'daprs_owner',
      organization_id: 'daorg_DIFFERENT_ORG_01234567890',
    })
    await GET(req, res)
    // org mismatch → denied
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

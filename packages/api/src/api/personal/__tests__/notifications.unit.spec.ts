import { GET, POST } from '../notifications/route'
import { access, csrf, enabled, sessionToken } from '../security'
import { IdentityAccessDenied } from '../../../modules/dogruadres-access/identity-session'
jest.mock('../security',()=>({access:jest.fn(),csrf:jest.fn(),enabled:jest.fn(),sessionToken:jest.fn()}))

describe('personal notification transport boundaries (not E2E)',()=>{
  let service:any,req:any,res:any
  beforeEach(()=>{
    service={personalSession:jest.fn(async()=>({person_id:'server-person'})),personalNotifications:jest.fn(async()=>({notifications:[],unread_count:0,next_offset:null})),readPersonalNotification:jest.fn(async()=>({success:true}))}
    req={query:{},body:{id:'danot_11111111-1111-4111-8111-111111111111'}}
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),json:jest.fn()}
    ;(enabled as jest.Mock).mockReturnValue(true);(sessionToken as jest.Mock).mockReturnValue('t'.repeat(43));(access as jest.Mock).mockReturnValue(service);(csrf as jest.Mock).mockResolvedValue(true)
  })
  it('never accepts a browser-supplied recipient or arbitrary notification payload',async()=>{
    req.body.person_id='other-person';await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(400);expect(service.readPersonalNotification).not.toHaveBeenCalled()
    req.query={person_id:'other-person'};await GET(req,res);expect(service.personalNotifications).not.toHaveBeenCalled()
  })
  it('requires current session and CSRF before any receipt write',async()=>{
    ;(csrf as jest.Mock).mockResolvedValue(false);await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403);expect(service.readPersonalNotification).not.toHaveBeenCalled()
    service.personalSession.mockResolvedValue(null);await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(401);expect(service.readPersonalNotification).not.toHaveBeenCalled()
  })
  it('uses only the server credential for listing and forbids caching',async()=>{
    await GET(req,res)
    expect(service.personalNotifications).toHaveBeenCalledWith('t'.repeat(43),0,undefined)
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
  })
  it('returns indistinguishable denial for foreign or nonexistent receipts',async()=>{
    service.readPersonalNotification.mockRejectedValue(new IdentityAccessDenied());await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(403);expect(res.json).toHaveBeenCalledWith({message:'Access denied'})
  })
  it('fails closed on persistence failure without reporting a completed read',async()=>{
    service.readPersonalNotification.mockRejectedValue(new Error('private SQL details'));await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({message:'Service unavailable'})
  })
})

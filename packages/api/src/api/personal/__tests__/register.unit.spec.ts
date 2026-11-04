import { POST } from "../register/route"
import { access, enabled, trustedOrigin } from "../security"
import { createCustomerAccountWorkflow } from "@medusajs/medusa/core-flows"

jest.mock("../security",()=>({
  access:jest.fn(),enabled:jest.fn(),trustedOrigin:jest.fn(),visitorRateAddress:jest.fn(()=>"private-direct:synthetic"),
}))
jest.mock("@medusajs/medusa/core-flows",()=>({
  createCustomerAccountWorkflow:jest.fn(),
}))

describe("M0 first-party Person signup with required private mobile",()=>{
  let req:any,res:any,auth:any,customer:any,service:any
  let hasCustomer:boolean
  let workflowRun:jest.Mock
  const valid={
    first_name:"Test",last_name:"Kişi",email:"test@example.invalid",
    password:"strong-password-123",mobile_phone:"+905551234567",
  }
  beforeEach(()=>{
    jest.clearAllMocks()
    hasCustomer=false
    service={
      personalLoginAttempt:jest.fn().mockResolvedValue(true),
      personalRegisterCustomer:jest.fn().mockResolvedValue({created:true}),
    }
    ;(access as jest.Mock).mockReturnValue(service)
    ;(enabled as jest.Mock).mockReturnValue(true)
    ;(trustedOrigin as jest.Mock).mockReturnValue(true)
    auth={
      register:jest.fn().mockResolvedValue({success:true,authIdentity:{id:"authid_own"}}),
      authenticate:jest.fn().mockImplementation(async()=>({
        success:true,authIdentity:{
          id:"authid_own",app_metadata:hasCustomer?{customer_id:"cus_own"}:{},
        },
      })),
      validateAuthIdentity:jest.fn().mockResolvedValue({authIdentity:{id:"authid_own"}}),
    }
    customer={retrieveCustomer:jest.fn().mockResolvedValue({
      id:"cus_own",email:"test@example.invalid",
    })}
    workflowRun=jest.fn().mockImplementation(async()=>{hasCustomer=true;return {result:{id:"cus_own"}}})
    ;(createCustomerAccountWorkflow as unknown as jest.Mock).mockReturnValue({run:workflowRun})
    req={
      body:{...valid},query:{},headers:{},socket:{remoteAddress:"127.0.0.1"},
      protocol:"https",url:"/personal/register",
      scope:{resolve:jest.fn((key:string)=>{
        if(key==="auth")return auth
        if(key==="customer")return customer
        throw Error("Unknown module: "+key)
      })},
    }
    res={setHeader:jest.fn(),status:jest.fn().mockReturnThis(),
      json:jest.fn().mockReturnThis()}
  })
  it("requires a first name, surname, email, password and phone on the SERVER",async()=>{
    for(const key of Object.keys(valid)){
      req.body={...valid};delete req.body[key]
      await POST(req,res)
      expect(res.status).toHaveBeenLastCalledWith(400)
    }
    expect(auth.register).not.toHaveBeenCalled()
    expect(service.personalRegisterCustomer).not.toHaveBeenCalled()
  })
  it.each(["+90 abc","", "12345", "+12345", "abc123", "+".repeat(20)])(
    "rejects invalid mobile without an account write: %s",async phone=>{
      req.body={...valid,mobile_phone:phone}
      await POST(req,res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(auth.register).not.toHaveBeenCalled()
    })
  it("accepts a leading plus with twenty digits, matching Foundation validation",async()=>{
    req.body={...valid,mobile_phone:"+"+"1".repeat(20)}
    await POST(req,res)
    expect(auth.register).toHaveBeenCalledTimes(1)
    expect(service.personalRegisterCustomer).toHaveBeenCalledWith(
      "authid_own","cus_own",req.body.mobile_phone,"Test Kişi")
    expect(res.status).toHaveBeenLastCalledWith(201)
  })
  it("rejects unauthorized origin and client-supplied identity fields",async()=>{
    ;(trustedOrigin as jest.Mock).mockReturnValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    ;(trustedOrigin as jest.Mock).mockReturnValue(true)
    req.body={...valid,person_id:"daprs_other"}
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    req.body={...valid};req.headers.authorization="Bearer stolen-actor-jwt"
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(400)
    expect(auth.register).not.toHaveBeenCalled()
  })
  it("uses official native Customer workflow and creates ONE Person with NO native token in response",async()=>{
    await POST(req,res)
    expect(auth.register).toHaveBeenCalledWith("emailpass",expect.objectContaining({
      body:{email:valid.email,password:valid.password},
    }))
    expect(createCustomerAccountWorkflow).toHaveBeenCalledWith(req.scope)
    expect(workflowRun).toHaveBeenCalledWith({
      input:{authIdentityId:"authid_own",customerData:{
        email:valid.email,first_name:valid.first_name,last_name:valid.last_name,
      }},
    })
    expect(service.personalRegisterCustomer).toHaveBeenCalledWith(
      "authid_own","cus_own",valid.mobile_phone,"Test Kişi")
    expect(res.status).toHaveBeenLastCalledWith(201)
    expect(res.json).toHaveBeenLastCalledWith({
      registered:true,next_step:"personal_login",
    })
    const output=JSON.stringify(res.json.mock.calls)
    expect(output).not.toContain(valid.mobile_phone)
    expect(output).not.toContain(valid.password)
    expect(output).not.toContain("customer_id")
  })
  it("resumes same-password native registration without a second native Customer or Person",async()=>{
    hasCustomer=true
    auth.register.mockResolvedValue({success:false,error:"Identity already registered"})
    service.personalRegisterCustomer.mockResolvedValue({created:false})
    await POST(req,res)
    expect(workflowRun).not.toHaveBeenCalled()
    expect(service.personalRegisterCustomer).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
  })
  it("never auto-merges an existing User/Member identity into a Person from email equality",async()=>{
    auth.authenticate.mockResolvedValue({success:true,authIdentity:{
      id:"authid_own",app_metadata:{user_id:"usr_other"},
    }})
    await POST(req,res)
    expect(res.status).toHaveBeenCalledWith(409)
    expect(workflowRun).not.toHaveBeenCalled()
    expect(service.personalRegisterCustomer).not.toHaveBeenCalled()
  })
  it("denies wrong-password re-registration, native MFA challenges and throttling",async()=>{
    auth.register.mockResolvedValue({success:false,error:"already exists"})
    auth.authenticate.mockResolvedValue({success:false})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(409)
    expect(workflowRun).not.toHaveBeenCalled()
    auth.authenticate.mockImplementation(async()=>({success:true,authIdentity:{
      id:"authid_own",app_metadata:{}
    }}))
    auth.validateAuthIdentity.mockResolvedValue({authIdentity:null,mfaChallenge:{id:"challenge"}})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    service.personalLoginAttempt.mockResolvedValue(false)
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(429)
    expect(service.personalRegisterCustomer).not.toHaveBeenCalled()
  })
  it("refuses native identity to Customer mismatch",async()=>{
    customer.retrieveCustomer.mockResolvedValue({id:"cus_other",email:valid.email})
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(403)
    expect(service.personalRegisterCustomer).not.toHaveBeenCalled()
  })
  it("does not claim success when native creation or Foundation commit is uncertain",async()=>{
    workflowRun.mockRejectedValue(Error("private details"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(service.personalRegisterCustomer).not.toHaveBeenCalled()
    workflowRun.mockImplementation(async()=>{hasCustomer=true;return {result:{id:"cus_own"}}})
    service.personalRegisterCustomer.mockRejectedValue(Error("secret phone"))
    await POST(req,res)
    expect(res.status).toHaveBeenLastCalledWith(503)
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/secret phone|private details/)
  })
})

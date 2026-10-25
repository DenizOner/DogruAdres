import { authenticate, defineMiddlewares } from "@medusajs/medusa"
import { errorHandler, validateAndTransformBody } from "@medusajs/framework/http"
import { nativeIngress } from "./personal/security"
import {
  acceptInvitationBody,
  changeMembershipBody,
  createInvitationBody,
  provisionOrganizationBody,
} from "./dogruadres/validators"

export default defineMiddlewares({
  errorHandler: (error,req,res,next) => {
    if(req.path.toLowerCase().startsWith("/personal")) {
      res.setHeader("Cache-Control","no-store")
      const denial=error?.name==="IdentityAccessDenied" || error?.message==="Access denied" || ["unauthorized","forbidden","not_allowed"].includes(error?.type)
      const status=error?.type==="invalid_data"?400:["forbidden","not_allowed"].includes(error?.type)?403:denial?401:503
      res.status(status).json({message:status===400?"Invalid input":denial?"Access denied":"Service unavailable"})
      return
    }
    return errorHandler()(error,req,res,next)
  },
  routes: [
    { matcher: "/*", middlewares: [nativeIngress] },
    {
      matcher: "/admin/dogruadres/organizations",
      methods: ["POST"],
      middlewares: [
        authenticate("user", ["session", "bearer"]),
        validateAndTransformBody(provisionOrganizationBody),
      ],
    },
    {
      matcher: "/dogruadres/organizations/:id/memberships/:membership_id",
      methods: ["POST"],
      middlewares: [
        authenticate(["user", "member", "customer"], ["session", "bearer"]),
        validateAndTransformBody(changeMembershipBody),
      ],
    },
    {
      matcher: "/dogruadres/organizations/:id/invitations",
      methods: ["POST"],
      middlewares: [
        authenticate(["user", "member", "customer"], ["session", "bearer"]),
        validateAndTransformBody(createInvitationBody),
      ],
    },
    {
      matcher: "/dogruadres/organizations/:id/invitations/:invitation_id",
      methods: ["DELETE"],
      middlewares: [authenticate(["user", "member", "customer"], ["session", "bearer"])],
    },
    {
      matcher: "/dogruadres/organizations/*",
      methods: ["GET"],
      middlewares: [authenticate(["user", "member", "customer"], ["session", "bearer"])],
    },
    {
      matcher: "/dogruadres/invitations/accept",
      methods: ["POST"],
      middlewares: [
        authenticate(["user", "member", "customer"], ["session", "bearer"]),
        validateAndTransformBody(acceptInvitationBody),
      ],
    },
  ],
})

import { authenticate, defineMiddlewares } from "@medusajs/medusa"
import { validateAndTransformBody } from "@medusajs/framework/http"
import {
  acceptInvitationBody,
  changeMembershipBody,
  createInvitationBody,
  provisionOrganizationBody,
} from "./dogruadres/validators"

export default defineMiddlewares({
  routes: [
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

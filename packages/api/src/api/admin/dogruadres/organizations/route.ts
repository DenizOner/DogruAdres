import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { provisionOrganizationWorkflow } from "../../../../workflows/dogruadres-access/provision-organization"
import type { ProvisionOrganizationBody } from "../../../dogruadres/validators"
import { requirePlatformAdministrator } from "../../../dogruadres/authorization"

export const POST = async (
  req: AuthenticatedMedusaRequest<ProvisionOrganizationBody>,
  res: MedusaResponse
) => {
  const provisionedBy = await requirePlatformAdministrator(req)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  for (const owner of req.validatedBody.initial_owners) {
    const { data } = await query.graph({
      entity: owner.actor_type,
      fields: ["id"],
      filters: { id: owner.actor_id },
    })
    if (data.length !== 1) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "An initial Owner actor could not be verified")
    }
  }
  const { result } = await provisionOrganizationWorkflow(req.scope).run({
    input: { ...req.validatedBody, provisioned_by: provisionedBy },
  })
  res.status(201).json({
    organization: { id: result.organization.id, name: result.organization.name, status: result.organization.status },
    initial_owner_count: result.memberships.length,
  })
}

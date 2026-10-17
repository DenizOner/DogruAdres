import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils"
import type { Context } from "@medusajs/framework/types"
import { canManageMembership, isOwnerDemotionAllowed, deriveInvitationToken, hashInvitationToken, invitationTokenMatches, normalizeEmail } from "./security"
import { ActorMapping, AuditEvent, Invitation, Membership, Organization, Person } from "./models"
import { randomBytes } from "node:crypto"
import { mayAcceptInvitation } from "./invitation-policy"

export type ActorReference = Readonly<{ actor_type: string; actor_id: string }>

type ProvisionOrganizationInput = Readonly<{
  name: string
  provisioned_by: ActorReference
  initial_owners: ActorReference[]
}>

type ChangeMembershipInput = Readonly<{
  organization_id: string
  membership_id: string
  actor_person_id: string
  role?: "owner" | "admin" | "member"
  status?: "active" | "revoked"
  actor_type: string
  actor_id: string
}>

type AdvisoryLockManager = Readonly<{
  execute: (query: string, parameters: string[]) => Promise<unknown>
}>

const activeStatus = "active"
const supportedActorTypes = new Set(["user", "member", "customer"])
export const DOGRUADRES_AUDIT_MODULE = "dogruadres-access"

export default class DogruAdresAccessModuleService extends MedusaService({
  Person,
  ActorMapping,
  Organization,
  Membership,
  Invitation,
  AuditEvent,
}) {
  private async ensureActorPerson_(
    actor: ActorReference,
    createdBy: ActorReference,
    sharedContext: Context
  ) {
    if (!supportedActorTypes.has(actor.actor_type) || !actor.actor_id) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Unsupported authenticated actor")
    }
    const mappings = await this.listActorMappings(
      { actor_type: actor.actor_type, actor_id: actor.actor_id },
      { take: 2 },
      sharedContext
    )
    if (mappings.length > 1) throw new Error("Ambiguous actor mapping")
    if (mappings[0]) {
      const people = await this.listPeople({ id: mappings[0].person_id }, { take: 2 }, sharedContext)
      if (people.length !== 1 || people[0].disabled_at) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Actor identity is unavailable")
      return people[0]
    }

    const [person] = await this.createPeople([{}], sharedContext)
    await this.createActorMappings([{
      actor_type: actor.actor_type,
      actor_id: actor.actor_id,
      person_id: person.id,
      created_by_actor_type: createdBy.actor_type,
      created_by_actor_id: createdBy.actor_id,
    }], sharedContext)
    return person
  }

  async resolvePersonForActor(actor: ActorReference) {
    if (!supportedActorTypes.has(actor.actor_type) || !actor.actor_id) return null
    const mappings = await this.listActorMappings(
      { actor_type: actor.actor_type, actor_id: actor.actor_id },
      { take: 2 }
    )
    if (mappings.length !== 1) return null
    const people = await this.listPeople({ id: mappings[0].person_id }, { take: 2 })
    if (people.length !== 1 || people[0].disabled_at) return null
    return people[0]
  }

  async getActiveMembership(personId: string, organizationId: string, sharedContext?: Context) {
    const memberships = await this.listMemberships(
      { person_id: personId, organization_id: organizationId, status: activeStatus },
      { take: 2 },
      sharedContext
    )
    return memberships.length === 1 ? memberships[0] : null
  }

  async getOrganization(organizationId: string, sharedContext?: Context) {
    const organizations = await this.listOrganizations({ id: organizationId }, { take: 2 }, sharedContext)
    return organizations.length === 1 ? organizations[0] : null
  }

  async getMembershipInOrganization(membershipId: string, organizationId: string, sharedContext?: Context) {
    const memberships = await this.listMemberships(
      { id: membershipId, organization_id: organizationId },
      { take: 2 },
      sharedContext
    )
    return memberships.length === 1 ? memberships[0] : null
  }

  async listOrganizationMemberships(organizationId: string) {
    return this.listMemberships({ organization_id: organizationId, status: "active" })
  }

  async getInvitationInOrganization(invitationId: string, organizationId: string, _sharedContext?: Context) {
    const invitations = await this.listInvitations(
      { id: invitationId, organization_id: organizationId },
      { take: 2 },
      _sharedContext
    )
    return invitations.length === 1 ? invitations[0] : null
  }

  private async lockInvitation_(invitationId: string, sharedContext: Context) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Invitation changes require an active database transaction")
    // EntityManager.execute forwards the active transaction context. Calling
    // getConnection().execute directly acquires a lock in autocommit instead.
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-invitation'), hashtext(?))",
      [invitationId]
    )
  }

  @InjectTransactionManager()
  async provisionOrganization(
    input: ProvisionOrganizationInput,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const name = input.name.trim()
    if (!name || !input.initial_owners.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Organization name and at least one initial Owner are required")
    const provisioner = await this.ensureActorPerson_(input.provisioned_by, input.provisioned_by, sharedContext)
    const owners: Array<{ id: string }> = []
    for (const actor of input.initial_owners) {
      owners.push(await this.ensureActorPerson_(actor, input.provisioned_by, sharedContext))
    }
    const uniqueOwnerIds = new Set(owners.map((person) => person.id))
    if (uniqueOwnerIds.size !== owners.length) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Initial Owners must be distinct canonical Persons")

    const [organization] = await this.createOrganizations([{ name, status: "active" }], sharedContext)
    const memberships = await this.createMemberships(
      owners.map((person) => ({
        organization_id: organization.id,
        person_id: person.id,
        role: "owner" as const,
        status: "active" as const,
        protected_owner: true,
      })),
      sharedContext
    )
    await this.createAuditEvents([
      {
        actor_id: input.provisioned_by.actor_id,
        actor_type: input.provisioned_by.actor_type,
        actor_person_id: provisioner.id,
        role_context: "platform_administrator",
        organization_id: organization.id,
        action: "organization.provisioned",
        module: DOGRUADRES_AUDIT_MODULE,
        resource: "organization",
        target_id: organization.id,
        new_values: { name: organization.name, initial_owner_count: memberships.length },
        occurred_at: new Date(),
      },
      ...memberships.map((membership, index) => ({
        actor_id: input.provisioned_by.actor_id,
        actor_type: input.provisioned_by.actor_type,
        actor_person_id: provisioner.id,
        role_context: "platform_administrator",
        organization_id: organization.id,
        action: "organization.owner_assigned",
        module: DOGRUADRES_AUDIT_MODULE,
        resource: "membership",
        target_id: membership.id,
        new_values: { role: "owner", protected_owner: true, person_id: owners[index].id },
        occurred_at: new Date(),
      })),
    ], sharedContext)
    return { organization, memberships }
  }

  @InjectTransactionManager()
  async changeMembership(
    input: ChangeMembershipInput,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const transactionManager = sharedContext.transactionManager as AdvisoryLockManager | undefined
    if (!transactionManager) throw new Error("Membership changes require an active database transaction")
    await transactionManager.execute(
      "SELECT pg_advisory_xact_lock(hashtext('dogruadres-owner-change'), hashtext(?))",
      [input.organization_id]
    )
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    }
    const target = await this.getMembershipInOrganization(input.membership_id, input.organization_id, sharedContext)
    if (!target) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Membership not found in the selected Organization")
    if (!canManageMembership(target.status)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Revoked membership can only be reactivated by accepting a fresh valid invitation")
    }

    const changesProtectedOwner = target.protected_owner || target.role === "owner" || input.role === "owner"
    if (changesProtectedOwner && !actorMembership.protected_owner) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Only a protected Owner can manage Owner status")
    }

    if (target.protected_owner && (input.role && input.role !== "owner" || input.status === "revoked")) {
      const ownerCount = await this.listMemberships({
        organization_id: input.organization_id,
        status: "active",
        role: "owner",
        protected_owner: true,
      }, {}, sharedContext)
      if (!isOwnerDemotionAllowed(ownerCount.length)) throw new MedusaError(MedusaError.Types.FORBIDDEN, "The last active protected Owner cannot be demoted or revoked")
    }

    const nextRole = input.role ?? target.role
    const nextStatus = input.status ?? target.status
    const updated = await this.updateMemberships({
      id: target.id,
      role: nextRole,
      status: nextStatus,
      protected_owner: nextRole === "owner" && nextStatus === "active",
      revoked_at: nextStatus === "revoked" ? new Date() : null,
    }, sharedContext)
    await this.createAuditEvents([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: input.organization_id,
      action: "organization.membership_changed",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "membership",
      target_id: target.id,
      previous_values: { role: target.role, status: target.status, protected_owner: target.protected_owner },
      new_values: { role: nextRole, status: nextStatus, protected_owner: nextRole === "owner" && nextStatus === "active" },
      occurred_at: new Date(),
    }], sharedContext)
    return updated
  }

  @InjectTransactionManager()
  async createOrganizationInvitation(
    input: Readonly<{ organization_id: string; actor_person_id: string; actor_type: string; actor_id: string; email: string; role: "admin" | "member" }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    }
    const organization = await this.getOrganization(input.organization_id, sharedContext)
    const people = await this.listPeople({ id: input.actor_person_id }, { take: 2 }, sharedContext)
    if (!organization || people.length !== 1) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation context could not be resolved")
    const recipient = normalizeEmail(input.email)
    if (!recipient || !recipient.includes("@")) throw new MedusaError(MedusaError.Types.INVALID_DATA, "A valid recipient email is required")

    // The placeholder is replaced inside this transaction. The plaintext token is
    // derived from the invitation id and is never returned by the workflow step.
    const [invitation] = await this.createInvitations([{
      organization_id: organization.id,
      created_by_person_id: people[0].id,
      recipient_email: recipient,
      role: input.role,
      token_hash: hashInvitationToken(randomBytes(32).toString("hex")),
      status: "pending",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }], sharedContext)
    const token = deriveInvitationToken(invitation.id)
    const updated = await this.updateInvitations({ id: invitation.id, token_hash: hashInvitationToken(token) }, sharedContext)
    await this.createAuditEvents([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: organization.id,
      action: "organization.invitation_created",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      new_values: { role: input.role, expires_at: updated.expires_at },
      occurred_at: new Date(),
    }], sharedContext)
    return updated
  }

  @InjectTransactionManager()
  async revokeOrganizationInvitation(
    input: Readonly<{ organization_id: string; invitation_id: string; actor_person_id: string; actor_type: string; actor_id: string }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    const actorMembership = await this.getActiveMembership(input.actor_person_id, input.organization_id, sharedContext)
    const invitation = await this.getInvitationInOrganization(input.invitation_id, input.organization_id, sharedContext)
    if (!actorMembership || !["owner", "admin"].includes(actorMembership.role)) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Active Owner or Admin membership is required")
    if (!invitation) throw new Error("Pending invitation not found")
    await this.lockInvitation_(invitation.id, sharedContext)
    const current = await this.getInvitationInOrganization(invitation.id, input.organization_id, sharedContext)
    if (!current || current.status !== "pending" || current.expires_at.getTime() <= Date.now()) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pending invitation not found")
    const updated = await this.updateInvitations({ id: current.id, status: "revoked", revoked_at: new Date() }, sharedContext)
    await this.createAuditEvents([{
      actor_id: input.actor_id,
      actor_type: input.actor_type,
      actor_person_id: input.actor_person_id,
      role_context: actorMembership.role,
      organization_id: input.organization_id,
      action: "organization.invitation_revoked",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      previous_values: { status: current.status },
      new_values: { status: "revoked" },
      occurred_at: new Date(),
    }], sharedContext)
    return updated
  }

  @InjectTransactionManager()
  async acceptOrganizationInvitation(
    input: Readonly<{ token: string; email: string; email_verified: boolean; actor: ActorReference }>,
    @MedusaContext() sharedContext: Context = {}
  ) {
    if (!input.email_verified) throw new MedusaError(MedusaError.Types.FORBIDDEN, "A verified recipient email is required")
    const email = normalizeEmail(input.email)
    const tokenHash = hashInvitationToken(input.token)
    const initialMatches = await this.listInvitations({ token_hash: tokenHash }, { take: 2 }, sharedContext)
    const initialInvitation = initialMatches.length === 1 ? initialMatches[0] : null
    if (!initialInvitation) throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation is invalid, expired, revoked, or already used")
    await this.lockInvitation_(initialInvitation.id, sharedContext)
    const invitations = await this.listInvitations({ id: initialInvitation.id, token_hash: tokenHash }, { take: 2 }, sharedContext)
    const invitation = invitations.length === 1 ? invitations[0] : null
    if (!invitation || !mayAcceptInvitation({
      status: invitation.status,
      expiresAt: invitation.expires_at,
      recipientEmail: invitation.recipient_email,
      verifiedEmail: input.email_verified ? email : null,
      tokenMatches: invitationTokenMatches(input.token, invitation.token_hash),
      now: new Date(),
    })) {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "Invitation is invalid, expired, revoked, or already used")
    }
    const person = await this.ensureActorPerson_(input.actor, input.actor, sharedContext)
    const existing = await this.listMemberships({ person_id: person.id, organization_id: invitation.organization_id }, { take: 2 }, sharedContext)
    if (existing.length > 1 || existing[0]?.status === "active") {
      throw new MedusaError(MedusaError.Types.FORBIDDEN, "An active membership for this Person and Organization already exists")
    }
    const [membership] = existing.length
      ? [await this.updateMemberships({
          id: existing[0].id,
          role: invitation.role,
          status: "active",
          protected_owner: false,
          revoked_at: null,
        }, sharedContext)]
      : await this.createMemberships([{
          person_id: person.id,
          organization_id: invitation.organization_id,
          role: invitation.role,
          status: "active",
          protected_owner: false,
        }], sharedContext)
    const accepted = await this.updateInvitations({
      id: invitation.id,
      status: "accepted",
      accepted_at: new Date(),
      accepted_by_person_id: person.id,
    }, sharedContext)
    await this.createAuditEvents([{
      actor_id: input.actor.actor_id,
      actor_type: input.actor.actor_type,
      actor_person_id: person.id,
      role_context: invitation.role,
      organization_id: invitation.organization_id,
      action: "organization.invitation_accepted",
      module: DOGRUADRES_AUDIT_MODULE,
      resource: "invitation",
      target_id: invitation.id,
      new_values: { status: accepted.status, membership_id: membership.id },
      occurred_at: new Date(),
    }], sharedContext)
    return { membership, invitation: accepted }
  }
}

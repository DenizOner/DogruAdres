export { consoleEarlyTokenScript } from "./token-capture"
import { scriptApiClient } from "./api-client"
import { scriptOrganizationsDrafts } from "./organizations-drafts"
import { scriptNotifications } from "./notifications"
import { scriptProfile } from "./profile"
import { scriptAudit } from "./audit"
import { scriptMfa } from "./mfa"
import { scriptInvitations } from "./invitations"
import { scriptLaunchers } from "./launchers"
import { scriptOrganizationsSelect } from "./organizations-select"
import { scriptStores } from "./stores"
import { scriptBuyer } from "./buyer"
import { scriptMemberships } from "./memberships"
import { scriptLifecycle } from "./lifecycle"
import { scriptPlatform } from "./platform"
import { scriptInitialization } from "./initialization"

export const consoleScripts: string = [
  scriptApiClient,
  scriptOrganizationsDrafts,
  scriptNotifications,
  scriptProfile,
  scriptAudit,
  scriptMfa,
  scriptInvitations,
  scriptLaunchers,
  scriptOrganizationsSelect,
  scriptStores,
  scriptBuyer,
  scriptMemberships,
  scriptLifecycle,
  scriptPlatform,
  scriptInitialization
].join("");

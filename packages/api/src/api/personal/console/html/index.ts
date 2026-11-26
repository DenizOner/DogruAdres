import { htmlShellHeader } from "./shell-header"
import { htmlInvitations } from "./invitations"
import { htmlAuth } from "./auth"
import { htmlProfileSecurity } from "./profile-security"
import { htmlOrganizationsLaunchers } from "./organizations-launchers"
import { htmlStores } from "./stores"
import { htmlBuyer } from "./buyer"
import { htmlAudit } from "./audit"
import { htmlMemberships } from "./memberships"
import { htmlShellFooter } from "./shell-footer"

export const consoleHtml: string = [
  htmlShellHeader,
  htmlInvitations,
  htmlAuth,
  htmlProfileSecurity,
  htmlOrganizationsLaunchers,
  htmlStores,
  htmlBuyer,
  htmlAudit,
  htmlMemberships,
  htmlShellFooter
].join("");

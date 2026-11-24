/**
 * Platform Admin Launcher:
 * Navigation only among existing, server-verified Platform Admin functions.
 * Never grant staff, actor, Store, Buyer or permission privilege.
 */
export type PlatformLauncherId =
  | "organization-review"
  | "store-approvals"
  | "store-renames"
  | "store-closings"
  | "store-closing-reviews"
  | "platform-mfa"
  | "platform-smtp"
  | "store-policy"

export const ALL_PLATFORM_LAUNCHER_IDS: readonly PlatformLauncherId[] = [
  "organization-review",
  "store-approvals",
  "store-renames",
  "store-closings",
  "store-closing-reviews",
  "platform-mfa",
  "platform-smtp",
  "store-policy",
] as const

export class PlatformLauncherInvalid extends Error {
  constructor() {
    super("Invalid platform launcher preference")
    this.name = "PlatformLauncherInvalid"
  }
}

export class PlatformLauncherConflict extends Error {
  constructor() {
    super("Platform launcher changed; reload before saving")
    this.name = "PlatformLauncherConflict"
  }
}

export function platformLauncherAvailable(tasks: readonly string[]): PlatformLauncherId[] {
  const taskSet = new Set(tasks)
  const allowed: PlatformLauncherId[] = []
  if (taskSet.has("organization.review")) allowed.push("organization-review")
  if (taskSet.has("store.approve")) {
    allowed.push("store-approvals")
    allowed.push("store-renames")
  }
  if (taskSet.has("store.closing.manage")) allowed.push("store-closings")
  if (taskSet.has("store.closing.review")) allowed.push("store-closing-reviews")
  if (taskSet.has("security.mfa.manage")) allowed.push("platform-mfa")
  if (taskSet.has("platform.smtp.manage")) allowed.push("platform-smtp")
  if (taskSet.has("store.application.policy.manage")) allowed.push("store-policy")
  return allowed
}

const parse = (input: unknown): unknown[] => {
  if (Array.isArray(input)) return input
  if (typeof input === "string") {
    try {
      const value: unknown = JSON.parse(input)
      return Array.isArray(value) ? value : []
    } catch {
      return []
    }
  }
  return []
}

export function platformLauncherProject(
  raw: { app_ids: unknown; collapsed_ids: unknown; version: unknown } | null,
  allowed: readonly PlatformLauncherId[]
) {
  if (
    raw &&
    (!Number.isSafeInteger(raw.version) ||
      (raw.version as number) < 1 ||
      (raw.version as number) > 2147483646)
  ) {
    throw new PlatformLauncherInvalid()
  }
  const selected: PlatformLauncherId[] = []
  const allowedSet = new Set<string>(allowed)
  for (const id of raw ? parse(raw.app_ids) : []) {
    if (
      typeof id === "string" &&
      allowedSet.has(id) &&
      !selected.includes(id as PlatformLauncherId)
    ) {
      selected.push(id as PlatformLauncherId)
    }
  }
  for (const id of allowed) {
    if (!selected.includes(id)) selected.push(id)
  }
  const collapsed = new Set(raw ? parse(raw.collapsed_ids) : [])
  return {
    app_ids: selected,
    collapsed_ids: selected.filter((id) => collapsed.has(id)),
    available_ids: [...allowed],
    version: raw ? (raw.version as number) : 0,
  }
}

export function platformLauncherValidate(
  appIds: unknown,
  collapsedIds: unknown,
  version: unknown,
  allowed: readonly PlatformLauncherId[]
): { app_ids: PlatformLauncherId[]; collapsed_ids: PlatformLauncherId[]; expected_version: number } {
  if (
    !Number.isSafeInteger(version) ||
    (version as number) < 0 ||
    (version as number) > 2147483646 ||
    !Array.isArray(appIds) ||
    appIds.length !== allowed.length ||
    !Array.isArray(collapsedIds) ||
    collapsedIds.length > allowed.length
  ) {
    throw new PlatformLauncherInvalid()
  }
  const approved = new Set<string>(allowed)
  if (
    appIds.some((id: unknown) => typeof id !== "string" || !approved.has(id)) ||
    new Set(appIds).size !== allowed.length ||
    collapsedIds.some((id: unknown) => typeof id !== "string" || !approved.has(id)) ||
    new Set(collapsedIds).size !== collapsedIds.length
  ) {
    throw new PlatformLauncherInvalid()
  }
  return {
    app_ids: appIds as PlatformLauncherId[],
    collapsed_ids: collapsedIds as PlatformLauncherId[],
    expected_version: version as number,
  }
}

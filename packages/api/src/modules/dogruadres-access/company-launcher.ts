/**
 * B20: the launcher is only navigation among existing, server-verified
 * Organization functions. Never grant an actor, Store, Buyer or staff privilege.
 * Historic Person-only 'storefront'/'vendor' choices are deliberately ignored.
 */
export type CompanyLauncherId = "organization" | "store-applications" | "memberships"

export class CompanyLauncherInvalid extends Error {
  constructor() { super("Invalid company launcher preference"); this.name = "CompanyLauncherInvalid" }
}
export class CompanyLauncherConflict extends Error {
  constructor() { super("Company launcher changed; reload before saving"); this.name = "CompanyLauncherConflict" }
}

const BASE: readonly CompanyLauncherId[] = ["organization"]
const OWNER: readonly CompanyLauncherId[] = ["organization", "store-applications", "memberships"]
export function companyLauncherAvailable(role: string): CompanyLauncherId[] {
  // The current, unrevoked protected-Owner role has already been established
  // using Foundation membership and protected-owner ACL, not caller input.
  return [...(role === "owner" ? OWNER : BASE)]
}
const parse = (input: unknown): unknown[] => {
  if (Array.isArray(input)) return input
  if (typeof input === "string") {
    try { const value: unknown = JSON.parse(input); return Array.isArray(value) ? value : [] }
    catch { return [] }
  }
  return []
}
export function companyLauncherProject(
  raw: { app_ids: unknown; collapsed_ids: unknown; version: unknown } | null,
  allowed: readonly CompanyLauncherId[]
) {
  if (raw && (!Number.isSafeInteger(raw.version) ||
      (raw.version as number) < 1 || (raw.version as number) > 2147483646)) {
    throw new CompanyLauncherInvalid()
  }
  const selected: CompanyLauncherId[] = []
  const allowedSet = new Set<string>(allowed)
  for (const id of raw ? parse(raw.app_ids) : []) {
    if (typeof id === "string" && allowedSet.has(id) &&
      !selected.includes(id as CompanyLauncherId)) selected.push(id as CompanyLauncherId)
  }
  for (const id of allowed) if (!selected.includes(id)) selected.push(id)
  const collapsed = new Set(raw ? parse(raw.collapsed_ids) : [])
  return {
    app_ids: selected,
    collapsed_ids: selected.filter(id => collapsed.has(id)),
    available_ids: [...allowed],
    version: raw ? raw.version as number : 0,
  }
}

export function companyLauncherValidate(
  appIds: unknown, collapsedIds: unknown, version: unknown,
  allowed: readonly CompanyLauncherId[]
): { app_ids: CompanyLauncherId[]; collapsed_ids: CompanyLauncherId[]; expected_version: number } {
  if (!Number.isSafeInteger(version) || (version as number) < 0 ||
      (version as number) > 2147483646 ||
      !Array.isArray(appIds) || appIds.length !== allowed.length ||
      !Array.isArray(collapsedIds) || collapsedIds.length > allowed.length)
    throw new CompanyLauncherInvalid()
  const approved = new Set<string>(allowed)
  if (appIds.some((id: unknown) => typeof id !== "string" || !approved.has(id)) ||
      new Set(appIds).size !== allowed.length ||
      collapsedIds.some((id: unknown) => typeof id !== "string" || !approved.has(id)) ||
      new Set(collapsedIds).size !== collapsedIds.length)
    throw new CompanyLauncherInvalid()
  return {
    app_ids: appIds as CompanyLauncherId[],
    collapsed_ids: collapsedIds as CompanyLauncherId[],
    expected_version: version as number,
  }
}

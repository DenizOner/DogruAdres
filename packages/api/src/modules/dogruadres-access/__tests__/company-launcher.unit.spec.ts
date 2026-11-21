import {
  CompanyLauncherInvalid, companyLauncherAvailable, companyLauncherProject,
  companyLauncherValidate,
} from "../company-launcher"

describe("B20 live-only Person x Organization launcher preference contract", () => {
  const owner = companyLauncherAvailable("owner")
  it("exposes only existing overview to ordinary and legacy-admin members", () => {
    expect(companyLauncherAvailable("member")).toEqual(["organization"])
    expect(companyLauncherAvailable("admin")).toEqual(["organization"])
    expect(companyLauncherAvailable("foreign")).toEqual(["organization"])
    expect(owner).toEqual(["organization", "store-applications", "memberships"])
    expect(owner).not.toContain("vendor")
    expect(owner).not.toContain("storefront")
  })
  it("uses only current permitted functions for an untouched Person x Organization pair", () => {
    expect(companyLauncherProject(null, owner)).toEqual({
      app_ids: owner, collapsed_ids: [], available_ids: owner, version: 0,
    })
  })
  it("projects an old Owner preference to today's lower permission without an automatic rewrite", () => {
    expect(companyLauncherProject({
      app_ids: ["memberships", "organization", "vendor"],
      collapsed_ids: ["memberships", "vendor"], version: 4,
    }, companyLauncherAvailable("member"))).toEqual({
      app_ids: ["organization"], collapsed_ids: [],
      available_ids: ["organization"], version: 4,
    })
  })
  it("retains independent order, collapse and version for a valid Owner pair", () => {
    const saved = {app_ids:["memberships","store-applications","organization"],
      collapsed_ids:["store-applications"],version:2}
    expect(companyLauncherProject(saved, owner)).toEqual({
      ...saved, available_ids: owner,
    })
    expect(companyLauncherValidate(saved.app_ids,saved.collapsed_ids,1,owner))
      .toEqual({app_ids:saved.app_ids,collapsed_ids:saved.collapsed_ids,expected_version:1})
  })
  it("never accepts synthetic apps, removed permissions, duplicate or missing IDs", () => {
    for (const ids of [
      ["organization", "memberships", "vendor"],
      ["organization", "memberships", "memberships"],
      ["organization", "memberships"],
      ["organization", "store-applications", "memberships", "unknown"],
    ]) {
      expect(() => companyLauncherValidate(ids, [], 1, owner)).toThrow(CompanyLauncherInvalid)
    }
    expect(() => companyLauncherValidate(["organization"],[],1,companyLauncherAvailable("owner")))
      .toThrow(CompanyLauncherInvalid)
    expect(() => companyLauncherValidate(owner,["memberships","memberships"],1,owner))
      .toThrow(CompanyLauncherInvalid)
    expect(() => companyLauncherValidate(owner,[],2147483647,owner))
      .toThrow(CompanyLauncherInvalid)
  })
  it("does not reflect malformed, legacy-only or extraneous stored IDs", () => {
    expect(companyLauncherProject({app_ids:"not-json",collapsed_ids:"{}",version:3},owner))
      .toEqual({app_ids:owner,collapsed_ids:[],available_ids:owner,version:3})
    expect(() => companyLauncherProject({app_ids:[],collapsed_ids:[],version:0},owner))
      .toThrow(CompanyLauncherInvalid)
  })
})

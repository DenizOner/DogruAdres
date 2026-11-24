import {
  PlatformLauncherConflict,
  PlatformLauncherInvalid,
  platformLauncherAvailable,
  platformLauncherProject,
  platformLauncherValidate,
} from "../platform-launcher"

describe("Platform launcher domain contract", () => {
  const allTasks = [
    "organization.review",
    "store.approve",
    "store.closing.manage",
    "store.closing.review",
    "security.mfa.manage",
    "platform.smtp.manage",
    "store.application.policy.manage",
  ]

  it("exposes only functions mapped to active verified platform staff tasks", () => {
    expect(platformLauncherAvailable([])).toEqual([])
    expect(platformLauncherAvailable(["unrelated.task"])).toEqual([])
    expect(platformLauncherAvailable(["organization.review"])).toEqual(["organization-review"])
    expect(platformLauncherAvailable(["store.approve"])).toEqual([
      "store-approvals",
      "store-renames",
    ])
    expect(platformLauncherAvailable(["store.closing.manage"])).toEqual(["store-closings"])
    expect(platformLauncherAvailable(["store.closing.review"])).toEqual(["store-closing-reviews"])
    expect(platformLauncherAvailable(["security.mfa.manage"])).toEqual(["platform-mfa"])
    expect(platformLauncherAvailable(["platform.smtp.manage"])).toEqual(["platform-smtp"])
    expect(platformLauncherAvailable(["store.application.policy.manage"])).toEqual(["store-policy"])

    const full = platformLauncherAvailable(allTasks)
    expect(full).toEqual([
      "organization-review",
      "store-approvals",
      "store-renames",
      "store-closings",
      "store-closing-reviews",
      "platform-mfa",
      "platform-smtp",
      "store-policy",
    ])
  })

  it("uses default canonical order for an untouched platform actor preference", () => {
    const allowed = platformLauncherAvailable(["organization.review", "security.mfa.manage"])
    expect(platformLauncherProject(null, allowed)).toEqual({
      app_ids: ["organization-review", "platform-mfa"],
      collapsed_ids: [],
      available_ids: ["organization-review", "platform-mfa"],
      version: 0,
    })
  })

  it("projects stored preference to current reduced permissions without errors", () => {
    const raw = {
      app_ids: ["platform-smtp", "organization-review", "store-approvals"],
      collapsed_ids: ["platform-smtp"],
      version: 3,
    }
    // Actor only has organization.review now
    const reduced = platformLauncherAvailable(["organization.review"])
    expect(platformLauncherProject(raw, reduced)).toEqual({
      app_ids: ["organization-review"],
      collapsed_ids: [],
      available_ids: ["organization-review"],
      version: 3,
    })
  })

  it("retains custom order and collapsed states for valid permitted IDs", () => {
    const allowed = platformLauncherAvailable(allTasks)
    const saved = {
      app_ids: [
        "platform-smtp",
        "platform-mfa",
        "organization-review",
        "store-approvals",
        "store-renames",
        "store-closings",
        "store-closing-reviews",
        "store-policy",
      ],
      collapsed_ids: ["store-closings", "store-policy"],
      version: 2,
    }
    expect(platformLauncherProject(saved, allowed)).toEqual({
      ...saved,
      available_ids: allowed,
    })
    expect(
      platformLauncherValidate(saved.app_ids, saved.collapsed_ids, 2, allowed)
    ).toEqual({
      app_ids: saved.app_ids,
      collapsed_ids: saved.collapsed_ids,
      expected_version: 2,
    })
  })

  it("rejects synthetic, missing, duplicate, or unpermitted app IDs", () => {
    const allowed = platformLauncherAvailable(["organization.review", "security.mfa.manage"])
    expect(() =>
      platformLauncherValidate(
        ["organization-review", "security.mfa.manage"], // wrong ID naming
        [],
        1,
        allowed
      )
    ).toThrow(PlatformLauncherInvalid)

    expect(() =>
      platformLauncherValidate(
        ["organization-review", "organization-review"], // duplicate
        [],
        1,
        allowed
      )
    ).toThrow(PlatformLauncherInvalid)

    expect(() =>
      platformLauncherValidate(
        ["organization-review"], // missing second app
        [],
        1,
        allowed
      )
    ).toThrow(PlatformLauncherInvalid)

    expect(() =>
      platformLauncherValidate(
        ["organization-review", "platform-mfa"],
        ["platform-smtp"], // unpermitted collapsed ID
        1,
        allowed
      )
    ).toThrow(PlatformLauncherInvalid)

    expect(() =>
      platformLauncherValidate(
        ["organization-review", "platform-mfa"],
        [],
        -1, // invalid version
        allowed
      )
    ).toThrow(PlatformLauncherInvalid)
  })

  it("handles malformed JSON or stringified values safely", () => {
    const allowed = platformLauncherAvailable(["platform.smtp.manage"])
    expect(
      platformLauncherProject(
        { app_ids: "invalid-json", collapsed_ids: "[]", version: 1 },
        allowed
      )
    ).toEqual({
      app_ids: ["platform-smtp"],
      collapsed_ids: [],
      available_ids: ["platform-smtp"],
      version: 1,
    })
  })
})

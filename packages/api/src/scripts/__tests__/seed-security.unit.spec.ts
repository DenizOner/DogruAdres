import { assertSafeSeedEnvironment, resolveDemoSellerPassword } from "../seed";

describe("seed script environment and password security (#176, IR-18)", () => {
  it("rejects execution when NODE_ENV is production", () => {
    expect(() => assertSafeSeedEnvironment({ NODE_ENV: "production" })).toThrow(
      /DEMO SEED REFUSED/
    );
  });

  it("rejects execution when MEDUSA_ENVIRONMENT is production", () => {
    expect(() =>
      assertSafeSeedEnvironment({ NODE_ENV: "development", MEDUSA_ENVIRONMENT: "production" })
    ).toThrow(/DEMO SEED REFUSED/);
  });

  it("accepts safe development or test environment", () => {
    expect(() => assertSafeSeedEnvironment({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSafeSeedEnvironment({ NODE_ENV: "test" })).not.toThrow();
  });

  it("rejects resolveDemoSellerPassword in production", () => {
    expect(() => resolveDemoSellerPassword({ NODE_ENV: "production" })).toThrow(
      /DEMO SEED REFUSED/
    );
  });

  it("never returns hardcoded 'supersecret'", () => {
    const devPass = resolveDemoSellerPassword({ NODE_ENV: "development" });
    const testPass = resolveDemoSellerPassword({ NODE_ENV: "test" });
    const fallbackPass = resolveDemoSellerPassword({ NODE_ENV: undefined });

    expect(devPass).not.toBe("supersecret");
    expect(testPass).not.toBe("supersecret");
    expect(fallbackPass).not.toBe("supersecret");
  });

  it("uses DEMO_SELLER_PASSWORD when provided with sufficient length", () => {
    const custom = "CustomSellerSecretPassword2026!";
    const resolved = resolveDemoSellerPassword({
      NODE_ENV: "development",
      DEMO_SELLER_PASSWORD: custom,
    });
    expect(resolved).toBe(custom);
  });

  it("falls back to secure test/dev passwords when DEMO_SELLER_PASSWORD is blank or too short", () => {
    const resolvedTest = resolveDemoSellerPassword({
      NODE_ENV: "test",
      DEMO_SELLER_PASSWORD: "   ",
    });
    expect(resolvedTest).toBe("DemoSellerTestPassword2026!");

    const resolvedDev = resolveDemoSellerPassword({
      NODE_ENV: "development",
      DEMO_SELLER_PASSWORD: "short",
    });
    expect(resolvedDev).toBe("DevSellerPassword2026!");
  });

  it("generates a high-entropy random password when no environment is specified", () => {
    const pass1 = resolveDemoSellerPassword({ NODE_ENV: undefined });
    const pass2 = resolveDemoSellerPassword({ NODE_ENV: undefined });
    expect(pass1.length).toBeGreaterThanOrEqual(16);
    expect(pass2.length).toBeGreaterThanOrEqual(16);
    expect(pass1).not.toBe(pass2);
  });
});

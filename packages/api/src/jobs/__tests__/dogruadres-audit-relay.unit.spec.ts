import dogruadresAuditRelayJob, { config, runAuditRelayBatch } from "../dogruadres-audit-relay"
import { relayFoundationAuditWorkflow } from "../../workflows/dogruadres-audit-relay"

jest.mock("../../workflows/dogruadres-audit-relay", () => ({
  relayFoundationAuditWorkflow: jest.fn(),
}))

describe("dogruadres-audit-relay scheduled job", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("exports valid Medusa scheduled job configuration", () => {
    expect(config.name).toBe("dogruadres-audit-relay")
    expect(config.schedule).toBe("* * * * *")
    expect(typeof dogruadresAuditRelayJob).toBe("function")
  })

  it("stops when relay is idle", async () => {
    const runSpy = jest.fn().mockResolvedValue({ result: "idle" })
    ;(relayFoundationAuditWorkflow as unknown as jest.Mock).mockReturnValue({ run: runSpy })

    const fakeContainer = {} as any
    const outcome = await runAuditRelayBatch(fakeContainer, 10)

    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(outcome.delivered).toBe(0)
    expect(outcome.idle).toBe(true)
  })

  it("relays up to batch limit and counts delivered items", async () => {
    let callCount = 0
    const runSpy = jest.fn().mockImplementation(async () => {
      callCount++
      if (callCount <= 3) return { result: "delivered" }
      return { result: "idle" }
    })
    ;(relayFoundationAuditWorkflow as unknown as jest.Mock).mockReturnValue({ run: runSpy })

    const fakeContainer = {} as any
    const outcome = await runAuditRelayBatch(fakeContainer, 10)

    expect(runSpy).toHaveBeenCalledTimes(4)
    expect(outcome.delivered).toBe(3)
    expect(outcome.idle).toBe(true)
  })

  it("stops on source_unavailable without throwing unhandled error", async () => {
    const runSpy = jest.fn().mockResolvedValue({ result: "source_unavailable" })
    ;(relayFoundationAuditWorkflow as unknown as jest.Mock).mockReturnValue({ run: runSpy })

    const fakeContainer = {} as any
    const outcome = await runAuditRelayBatch(fakeContainer, 5)

    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(outcome.delivered).toBe(0)
    expect(outcome.idle).toBe(false)
    expect(outcome.lastOutcome).toBe("source_unavailable")
  })

  it("default job handler executes runAuditRelayBatch", async () => {
    const runSpy = jest.fn().mockResolvedValue({ result: "idle" })
    ;(relayFoundationAuditWorkflow as unknown as jest.Mock).mockReturnValue({ run: runSpy })

    const fakeContainer = {} as any
    await dogruadresAuditRelayJob(fakeContainer)
    expect(runSpy).toHaveBeenCalled()
  })
})

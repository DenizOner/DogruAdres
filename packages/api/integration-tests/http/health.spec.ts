import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  // Medusa 2.22 removed the inApp integration test runner option.
  env: {},
  testSuite: ({ api }) => {
    describe("Ping", () => {
      it("ping the server health endpoint", async () => {
        const response = await api.get('/health')
        expect(response.status).toEqual(200)
      })
    })
  },
})
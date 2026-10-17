const { loadEnv } = require("@medusajs/framework/utils");
loadEnv("test", process.cwd());

module.exports = {
  transform: {
    "node_modules[\\\\/].*core-flows[\\\\/]dist[\\\\/](cart|order|payment)[\\\\/].*\\.js$":
      "@mercurjs/core/patches/jest-transformer",
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          target: "es2021",
        },
      },
    ],
  },
  testEnvironment: "node",
  transformIgnorePatterns: [
    "/node_modules/(?!.*core-flows[\\\\/]dist[\\\\/](cart|order|payment)[\\\\/]|(?:.*[\\\\/])?(htmlparser2|domhandler|domutils|domelementtype|dom-serializer|entities)[\\\\/]dist[\\\\/])",
  ],
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
};

if (process.env.TEST_TYPE === "integration:http") {
  module.exports.testMatch = ["**/integration-tests/http/*.spec.[jt]s"];
} else if (process.env.TEST_TYPE === "integration:modules") {
  module.exports.testMatch = ["**/src/modules/*/__tests__/**/*.[jt]s"];
} else if (process.env.TEST_TYPE === "unit") {
  module.exports.testMatch = ["**/src/**/__tests__/**/*.unit.spec.[jt]s"];
}

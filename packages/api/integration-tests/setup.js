// Medusa loads the TypeScript config through Node, outside Jest's transforms.
require("ts-node/register/transpile-only")

const { MetadataStorage } = require("@medusajs/framework/mikro-orm/core")

MetadataStorage.clear()

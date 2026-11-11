import { createClient, type InferClient } from '@mercurjs/client';
import type { Routes } from '@acme/api/_generated';

const MEDUSA_BACKEND_URL = process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000';

// Public Storefront only uses native store/auth routes. Avoid checking
// unrelated admin/vendor backend modules through generated declaration types.
type StorefrontRoutes = Pick<Routes, "store" | "auth">;

export const sdk: InferClient<StorefrontRoutes> = createClient({
  baseUrl: MEDUSA_BACKEND_URL,
  fetchOptions: {
    headers: {
      'x-publishable-api-key': process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY as string,
    },
  },
});

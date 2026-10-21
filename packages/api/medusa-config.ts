import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'
import fs from 'fs'
import path from 'path'
import { resolveHttpSecrets } from './src/utils/production-secrets'
import {ingressConfig} from './src/utils/ingress-config'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Fail closed even when Medusa evaluates configuration during a production build.
const httpSecrets = resolveHttpSecrets(process.env)
if (process.env.DOGRUADRES_IDENTITY_ENABLED === 'true') {
  ingressConfig(process.env)
  const origin = new URL(process.env.DOGRUADRES_PUBLIC_ORIGIN || '')
  const local = process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(origin.hostname)
  if ((!local && origin.protocol !== 'https:') || origin.origin !== process.env.DOGRUADRES_PUBLIC_ORIGIN ||
      !process.env.COOKIE_SECRET || process.env.COOKIE_SECRET.length < 32 ||
      !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
      !process.env.DOGRUADRES_MFA_ENCRYPTION_KEY || process.env.DOGRUADRES_MFA_ENCRYPTION_KEY.length < 32) {
    throw new Error('Personal ingress requires a secure exact origin and strong cookie/MFA secrets')
  }
  if(new Set([process.env.COOKIE_SECRET,process.env.JWT_SECRET,process.env.DOGRUADRES_MFA_ENCRYPTION_KEY]).size!==3)throw new Error('Personal ingress requires independent secrets')
}

// Resolves where a dashboard app lives:
// - in the source tree (development): ../../apps/<name>
// - in the production build artifact: hosts that deploy only `.medusa/server` (for example
//   Medusa Cloud) get the panels bundled into ./dashboards/<name> by
//   scripts/bundle-dashboards.mjs during `build`. The compiled config runs from the
//   artifact root, so __dirname points there.
const dashboardAppDir = (name: string) => {
  const bundled = path.join(__dirname, 'dashboards', name)
  return fs.existsSync(bundled) ? bundled : path.join(__dirname, `../../apps/${name}`)
}

module.exports = withMercur({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      vendorCors: process.env.VENDOR_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: httpSecrets.jwtSecret,
      cookieSecret: httpSecrets.cookieSecret,
    }
  },
  featureFlags: {
    seller_registration: true
  },
  modules: [
    ...(process.env.DOGRUADRES_IDENTITY_ENABLED === 'true' ? [{
      resolve: '@medusajs/medusa/auth',
      options: {
        providers: [{ resolve: '@medusajs/medusa/auth-emailpass', id: 'emailpass' }],
        mfa: { encryption_key: process.env.DOGRUADRES_MFA_ENCRYPTION_KEY },
      },
    }] : []),
    {
      resolve: '@mercurjs/core/modules/admin-ui',
      options: {
        appDir: dashboardAppDir('admin'),
        path: '/dashboard',
      }
    },
    {
      resolve: '@mercurjs/core/modules/vendor-ui',
      options: {
        appDir: dashboardAppDir('vendor'),
        path: '/seller',
      }
    },
    {
      resolve: '@medusajs/medusa/file',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/file-local',
            id: 'local',
            options: {
              // The local provider bakes this into every uploaded file URL.
              // It must be the publicly reachable origin in production, or
              // images resolve to localhost and render broken.
              backend_url: process.env.FILE_BACKEND_URL || 'http://localhost:9000/static',
            },
          },
        ],
      },
    },
    {
      resolve: './src/modules/dogruadres-access',
    },
  ],
})

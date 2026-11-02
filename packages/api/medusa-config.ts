import { loadEnv } from '@medusajs/framework/utils'
import { withMercur } from '@mercurjs/core'
import fs from 'fs'
import path from 'path'
import { resolveHttpSecrets } from './src/utils/production-secrets'
import {ingressConfig} from './src/utils/ingress-config'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Official Medusa locking provider is enabled ONLY inside the previously
// authorized B22 disposable PostgreSQL acceptance database. Production,
// protected data, and every other runtime keep their existing configuration.
const b22DisposablePgLock=process.env.DOGRUADRES_B22_PG_LOCK_TEST==="true"
const b22DisposableRedisLock=process.env.DOGRUADRES_B22_REDIS_LOCK_TEST==="true"
if(b22DisposablePgLock && b22DisposableRedisLock)
  throw new Error("REFUSED: two B22 CI Locking providers")
if(b22DisposablePgLock || b22DisposableRedisLock){
  const db=new URL(process.env.DATABASE_URL??"postgres://invalid/invalid")
  if(process.env.CI!=="true"||process.env.GITHUB_ACTIONS!=="true"||
      process.env.GITHUB_EVENT_NAME!=="pull_request"||
      process.env.PG_MFA_TEST_SCOPE!=="b22-ui"||
      process.env.PG_MFA_TEST_SENTINEL!=="mfa-pg16-disposable-ci-v1"||
      process.env.NODE_ENV!=="test"||
      db.protocol!=="postgres:"||db.hostname!=="127.0.0.1"||
      db.port!=="5432"||db.username!=="mfa_test"||
      db.password!=="ci-disposable-only-not-a-real-secret"||
      !/^\/mfa_cli_ci_[0-9a-f]{16}$/.test(db.pathname))
    throw new Error("REFUSED: B22 locking only on an exact task-owned disposable CI database")
}
if(b22DisposableRedisLock && (
  process.env.LOCKING_REDIS_URL!=="redis://127.0.0.1:6379" ||
  !/^b22-redis-process-exit:[0-9a-f]{16}$/.test(process.env.B22_REDIS_PROBE_KEY??"") ||
  !["crash","recover"].includes(process.env.B22_REDIS_PROBE_MODE??"")
))throw new Error("REFUSED: Redis only for B22 disposable process-exit CI probe")


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
    workerMode: (process.env.MEDUSA_WORKER_MODE as any) || "shared",
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
    ...(b22DisposablePgLock ? [{
      resolve: "@medusajs/medusa/locking",
      options: { providers: [{
        resolve: "@medusajs/medusa/locking-postgres",
        id: "locking-postgres",
        is_default: true,
      }] },
    }] : b22DisposableRedisLock ? [{
      resolve: "@medusajs/medusa/locking",
      options: { providers: [{
        resolve: "@medusajs/medusa/locking-redis",
        id: "locking-redis",
        is_default: true,
        options: {
          redisUrl: process.env.LOCKING_REDIS_URL,
          namespace: "b22-ci-lock:" + new URL(process.env.DATABASE_URL!).pathname.slice(1) + ":",
        },
      }] },
    }] : []),
    {
      resolve: '@medusajs/medusa/notification',
      dependencies: ['dogruadresAccess'],
      options: {
        providers: [{
          resolve: './src/modules/notification-smtp',
          id: 'notification-smtp',
          options: { channels: ['email'] },
        }],
      },
    },
    ...(process.env.DOGRUADRES_IDENTITY_ENABLED === 'true' ? [{
      resolve: '@medusajs/medusa/auth',
      options: {
        providers: [{ resolve: '@medusajs/medusa/auth-emailpass', id: 'emailpass' }],
        // Medusa v2.21.2 defaults to "session", which lets a stolen session
        // disable TOTP without verifying a second factor. Never rely on that.
        mfa: {
          encryption_key: process.env.DOGRUADRES_MFA_ENCRYPTION_KEY,
          disable_policy: 'challenge',
        },
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
    {
      resolve: './src/modules/dogruadres-audit-index',
    },
  ],
})

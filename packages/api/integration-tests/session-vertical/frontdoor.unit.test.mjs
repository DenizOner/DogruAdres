import {test} from 'node:test'
import assert from 'node:assert/strict'
import {allowedPublicRequest} from '../../scripts/personal-frontdoor.mjs'

test('closed public method/path contract never exposes native login or refresh',()=>{
  for(const actor of ['user','member','customer'])for(const method of ['GET','POST'])
    assert.equal(allowedPublicRequest(method,`/auth/${actor}/emailpass`),false)
  for(const path of ['/auth/token/refresh','/auth/session','/auth/verification/request','/vendor/members/me','/store/customers/me','/hooks/private','/cloud/users','/plugin/private'])
    for(const method of ['GET','POST'])assert.equal(allowedPublicRequest(method,path),false)
})
test('personal, public catalog and purpose-bound recovery are explicit exceptions',()=>{
  for(const path of ['/personal','/personal/contexts','/personal/memberships','/store/regions','/store/products','/store/products/prod_test','/store/sellers','/store/product-categories'])assert.equal(allowedPublicRequest('GET',path),true)
  for(const path of ['/auth/user/emailpass/reset-password','/auth/customer/emailpass/update','/auth/verification/confirm'])assert.equal(allowedPublicRequest('POST',path),true)
  assert.equal(allowedPublicRequest('GET','/admin/api-keys'),'machine')
  assert.equal(allowedPublicRequest('POST','/admin/api-keys'),false)
  assert.equal(allowedPublicRequest('GET','/personal/private'),false)
})

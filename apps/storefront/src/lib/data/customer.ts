'use server';

import { HttpTypes } from '@medusajs/types';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';

import { sdk } from '../client';

type CustomerActionResult = { success: boolean; error: string | null };
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  removeAuthToken,
  removeCartId,
  setAuthToken
} from './cookies';

export const retrieveCustomer = async (): Promise<HttpTypes.StoreCustomer | null> => {
  const authHeaders = await getAuthHeaders();
  if (!authHeaders) return null;

  const headers = {
    ...authHeaders
  };

  const next = {
    ...(await getCacheOptions('customers'))
  };

  return await (sdk.store.customers.me
    .query({
      fields: '*orders',
      fetchOptions: { headers, next, cache: 'force-cache' }
    } as never) as unknown as Promise<{ customer: HttpTypes.StoreCustomer }>)
    .then(({ customer }) => customer ?? null)
    .catch(() => null);
};

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  const headers = {
    ...(await getAuthHeaders())
  };

  const updateRes = await sdk.store.customers.me
    .mutate({ ...body, fetchOptions: { headers } })
    .then(({ customer }) => customer)
    .catch(err => {
      throw new Error(err.message);
    });

  const cacheTag = await getCacheTag('customers');
  revalidateTag(cacheTag);

  return updateRes;
};

export async function signup(formData: FormData) {
  const password = formData.get('password') as string;
  const customerForm = {
    email: formData.get('email') as string,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    phone: formData.get('phone') as string
  };

  try {
    const token = await (sdk.auth.$actorType.$authProvider.register
      .mutate({
        $actorType: 'customer',
        $authProvider: 'emailpass',
        email: customerForm.email,
        password: password
      } as never) as unknown as Promise<{ token: string }>)
      .then(({ token }) => token);

    await setAuthToken(token as string);

    const headers = {
      ...(await getAuthHeaders())
    };

    const { customer: createdCustomer } = await (sdk.store.customers.mutate({
      ...customerForm,
      fetchOptions: { headers }
    } as never) as unknown as Promise<{ customer: HttpTypes.StoreCustomer }>);

    const loginToken = await (sdk.auth.$actorType.$authProvider
      .mutate({
        $actorType: 'customer',
        $authProvider: 'emailpass',
        email: customerForm.email,
        password
      } as never) as unknown as Promise<{ token: string }>)
      .then(({ token }) => token);

    await setAuthToken(loginToken as string);

    const customerCacheTag = await getCacheTag('customers');
    revalidateTag(customerCacheTag);

    await transferCart();

    return createdCustomer;
  } catch (error: unknown) {
    return String(error);
  }
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  try {
    const token = await (sdk.auth.$actorType.$authProvider
      .mutate({ $actorType: 'customer', $authProvider: 'emailpass', email, password } as never) as unknown as Promise<{ token: string }>)
      .then(({ token }) => token);
    await setAuthToken(token as string);
    const customerCacheTag = await getCacheTag('customers');
    revalidateTag(customerCacheTag);

    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      message: (error as Error)?.message || 'Unable to log in. Please try again.'
    };
  }
}

export async function signout() {
  await removeAuthToken();

  const customerCacheTag = await getCacheTag('customers');
  revalidateTag(customerCacheTag);

  await removeCartId();

  const cartCacheTag = await getCacheTag('carts');
  revalidateTag(cartCacheTag);
  redirect(`/`);
}

export async function transferCart() {
  const cartId = await getCartId();

  if (!cartId) {
    return;
  }

  const headers = await getAuthHeaders();

  await sdk.store.carts.$id.customer.mutate({ $id: cartId, fetchOptions: { headers } });

  const cartCacheTag = await getCacheTag('carts');
  revalidateTag(cartCacheTag);
}

export const addCustomerAddress = async (formData: FormData): Promise<CustomerActionResult> => {
  const address = {
    address_name: formData.get('address_name') as string,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    company: formData.get('company') as string,
    address_1: formData.get('address_1') as string,
    city: formData.get('city') as string,
    postal_code: formData.get('postal_code') as string,
    country_code: formData.get('country_code') as string,
    phone: formData.get('phone') as string,
    province: formData.get('province') as string,
    is_default_billing: Boolean(formData.get('isDefaultBilling')),
    is_default_shipping: Boolean(formData.get('isDefaultShipping'))
  };

  const headers = {
    ...(await getAuthHeaders())
  };

  return (sdk.store.customers.me.addresses
    .mutate({ ...address, fetchOptions: { headers } } as never) as unknown as Promise<unknown>)
    .then(async () => {
      const customerCacheTag = await getCacheTag('customers');
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(err => {
      return { success: false, error: err.toString() };
    });
};

export const deleteCustomerAddress = async (addressId: string): Promise<void> => {
  const headers = {
    ...(await getAuthHeaders())
  };

  await (sdk.store.customers.me.addresses.$addressId
    .delete({ $addressId: addressId, fetchOptions: { headers } } as never) as unknown as Promise<unknown>)
    .then(async () => {
      const customerCacheTag = await getCacheTag('customers');
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(err => {
      return { success: false, error: err.toString() };
    });
};

export const updateCustomerAddress = async (formData: FormData): Promise<CustomerActionResult> => {
  const addressId = formData.get('addressId') as string;

  if (!addressId) {
    return { success: false, error: 'Address ID is required' };
  }

  const address = {
    address_name: formData.get('address_name') as string,
    first_name: formData.get('first_name') as string,
    last_name: formData.get('last_name') as string,
    company: formData.get('company') as string,
    address_1: formData.get('address_1') as string,
    address_2: formData.get('address_2') as string,
    city: formData.get('city') as string,
    postal_code: formData.get('postal_code') as string,
    province: formData.get('province') as string,
    country_code: formData.get('country_code') as string
  } as HttpTypes.StoreUpdateCustomerAddress;

  const phone = formData.get('phone') as string;

  if (phone) {
    address.phone = phone;
  }

  const headers = {
    ...(await getAuthHeaders())
  };

  return (sdk.store.customers.me.addresses.$addressId
    .mutate({ $addressId: addressId, ...address, fetchOptions: { headers } } as never) as unknown as Promise<unknown>)
    .then(async () => {
      const customerCacheTag = await getCacheTag('customers');
      revalidateTag(customerCacheTag);
      return { success: true, error: null };
    })
    .catch(err => {
      return { success: false, error: err.toString() };
    });
};

export const updateCustomerPassword = async (password: string, token: string): Promise<CustomerActionResult> => {
  const res = await (sdk.auth.$actorType.$authProvider.update
    .mutate({
      $actorType: 'customer',
      $authProvider: 'emailpass',
      password,
      fetchOptions: { headers: { authorization: `Bearer ${token}` } }
    } as never) as unknown as Promise<unknown>)
    .then(async () => {
      // Anonymous password recovery has no session to clear. Setting a blank
      // session cookie unnecessarily re-renders the entire Next.js route
      // after the credential was already updated.
      const authHeaders = await getAuthHeaders();
      if ('authorization' in authHeaders) {
        await removeAuthToken();
      }
      const customerCacheTag = await getCacheTag('customers');
      if (customerCacheTag) {
        revalidateTag(customerCacheTag);
      }
      return { success: true, error: null };
    })
    .catch(() => {
      // A reset error must never reveal backend details or bearer values.
      return { success: false, error: 'Password reset could not be completed. Please request a new link.' };
    });

  return res;
};

export const sendResetPasswordEmail = async (email: string) => {
  const res = await (sdk.auth.$actorType.$authProvider.resetPassword
    .mutate({
      $actorType: 'customer',
      $authProvider: 'emailpass',
      identifier: email
    } as never) as unknown as Promise<unknown>)
    .then(() => {
      return { success: true, error: null };
    })
    .catch(() => {
      // The public reset request must not expose provider errors, accounts or internal detail.
      return { success: false, error: 'Password reset is temporarily unavailable. Please try again.' };
    });

  return res;
};

import { HttpTypes } from '@medusajs/types';

export type CartAddressPayload = {
  first_name?: string;
  last_name?: string;
  address_1?: string;
  address_2?: string;
  company?: string;
  postal_code?: string;
  city?: string;
  country_code?: string;
  province?: string;
  phone?: string;
};

export type ParsedCartAddresses = {
  shipping_address: CartAddressPayload;
  billing_address: CartAddressPayload;
  email?: string;
  isSameAsBilling: boolean;
};

export interface FormDataLike {
  get(name: string): unknown;
}

const textField = (formData: FormDataLike, key: string): string | undefined => {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
};

/**
 * Determines whether the user selected "Same as billing address" or separate billing.
 * Accepts 'on', 'true', or boolean true as same-as-billing.
 */
export function isSameAsBillingSelected(formData: FormDataLike): boolean {
  const value = formData.get('same_as_billing');
  if (value === true || value === 'true' || value === 'on') {
    return true;
  }
  return false;
}

/**
 * Parses and separates shipping and billing addresses from checkout form submission (#164).
 * Prevents unconditionally overwriting billing_address with shipping_address.
 */
export function parseCartAddresses(formData: FormDataLike): ParsedCartAddresses {
  const isSameAsBilling = isSameAsBillingSelected(formData);

  const shipping_address: CartAddressPayload = {
    first_name: textField(formData, 'shipping_address.first_name'),
    last_name: textField(formData, 'shipping_address.last_name'),
    address_1: textField(formData, 'shipping_address.address_1'),
    address_2: textField(formData, 'shipping_address.address_2') ?? '',
    company: textField(formData, 'shipping_address.company') ?? '',
    postal_code: textField(formData, 'shipping_address.postal_code'),
    city: textField(formData, 'shipping_address.city'),
    country_code: textField(formData, 'shipping_address.country_code'),
    province: textField(formData, 'shipping_address.province') ?? '',
    phone: textField(formData, 'shipping_address.phone') ?? '',
  };

  const billing_address: CartAddressPayload = isSameAsBilling
    ? { ...shipping_address }
    : {
        first_name: textField(formData, 'billing_address.first_name') ?? shipping_address.first_name,
        last_name: textField(formData, 'billing_address.last_name') ?? shipping_address.last_name,
        address_1: textField(formData, 'billing_address.address_1') ?? shipping_address.address_1,
        address_2: textField(formData, 'billing_address.address_2') ?? '',
        company: textField(formData, 'billing_address.company') ?? '',
        postal_code: textField(formData, 'billing_address.postal_code') ?? shipping_address.postal_code,
        city: textField(formData, 'billing_address.city') ?? shipping_address.city,
        country_code: textField(formData, 'billing_address.country_code') ?? shipping_address.country_code,
        province: textField(formData, 'billing_address.province') ?? '',
        phone: textField(formData, 'billing_address.phone') ?? shipping_address.phone,
      };

  return {
    shipping_address,
    billing_address,
    email: textField(formData, 'email'),
    isSameAsBilling,
  };
}

import { describe, expect, it } from 'bun:test';
import {
  isSameAsBillingSelected,
  parseCartAddresses,
  shouldNavigateToDelivery,
  type FormDataLike,
  type SetAddressesResult,
} from '../cart-address-utils';

class MockFormData implements FormDataLike {
  private map = new Map<string, unknown>();

  constructor(entries: Record<string, unknown> = {}) {
    for (const [key, val] of Object.entries(entries)) {
      this.map.set(key, val);
    }
  }

  get(name: string): unknown {
    return this.map.get(name) ?? null;
  }
}

describe('cart-address-utils (#164)', () => {
  describe('isSameAsBillingSelected', () => {
    it('returns true when same_as_billing is "on", "true", or boolean true', () => {
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: 'on' }))).toBe(true);
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: 'true' }))).toBe(true);
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: true }))).toBe(true);
    });

    it('returns false when same_as_billing is absent, false, or other values', () => {
      expect(isSameAsBillingSelected(new MockFormData({}))).toBe(false);
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: 'off' }))).toBe(false);
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: false }))).toBe(false);
      expect(isSameAsBillingSelected(new MockFormData({ same_as_billing: null }))).toBe(false);
    });
  });

  describe('parseCartAddresses', () => {
    const baseShipping = {
      'shipping_address.first_name': 'Ahmet',
      'shipping_address.last_name': 'Yilmaz',
      'shipping_address.address_1': 'Ataturk Cad. No: 12',
      'shipping_address.address_2': 'Daire 4',
      'shipping_address.company': 'DogruAdres AS',
      'shipping_address.postal_code': '34000',
      'shipping_address.city': 'Istanbul',
      'shipping_address.country_code': 'tr',
      'shipping_address.province': 'Istanbul',
      'shipping_address.phone': '+905551234567',
      email: 'ahmet@example.com',
    };

    it('clones shipping_address into billing_address when same_as_billing is checked', () => {
      const formData = new MockFormData({
        ...baseShipping,
        same_as_billing: 'on',
        // Even if some stale billing fields exist in DOM, same_as_billing takes precedence
        'billing_address.first_name': 'Mehmet',
      });

      const result = parseCartAddresses(formData);
      expect(result.isSameAsBilling).toBe(true);
      expect(result.shipping_address.first_name).toBe('Ahmet');
      expect(result.shipping_address.city).toBe('Istanbul');
      expect(result.billing_address).toEqual(result.shipping_address);
      expect(result.email).toBe('ahmet@example.com');
    });

    it('preserves separate billing address when same_as_billing is unchecked (#164)', () => {
      const formData = new MockFormData({
        ...baseShipping,
        same_as_billing: 'off',
        'billing_address.first_name': 'Mehmet',
        'billing_address.last_name': 'Demir',
        'billing_address.address_1': 'Inonu Bulvari No: 5',
        'billing_address.address_2': 'Kat 2',
        'billing_address.company': 'Fatura LTD',
        'billing_address.postal_code': '06000',
        'billing_address.city': 'Ankara',
        'billing_address.country_code': 'tr',
        'billing_address.province': 'Ankara',
        'billing_address.phone': '+905559876543',
      });

      const result = parseCartAddresses(formData);
      expect(result.isSameAsBilling).toBe(false);

      // Shipping address matches shipping fields
      expect(result.shipping_address.first_name).toBe('Ahmet');
      expect(result.shipping_address.city).toBe('Istanbul');
      expect(result.shipping_address.company).toBe('DogruAdres AS');

      // Billing address reflects separate billing fields
      expect(result.billing_address.first_name).toBe('Mehmet');
      expect(result.billing_address.last_name).toBe('Demir');
      expect(result.billing_address.address_1).toBe('Inonu Bulvari No: 5');
      expect(result.billing_address.company).toBe('Fatura LTD');
      expect(result.billing_address.postal_code).toBe('06000');
      expect(result.billing_address.city).toBe('Ankara');
      expect(result.billing_address.province).toBe('Ankara');
      expect(result.billing_address.phone).toBe('+905559876543');

      // Shipping and billing must NOT be equal
      expect(result.billing_address).not.toEqual(result.shipping_address);
    });

    it('falls back to shipping values for unspecified optional fields in separate billing', () => {
      const formData = new MockFormData({
        ...baseShipping,
        // same_as_billing is absent (unchecked)
        'billing_address.first_name': 'Mehmet',
        'billing_address.last_name': 'Demir',
        'billing_address.address_1': 'Inonu Bulvari No: 5',
        // postal_code, city, country_code missing from billing form
      });

      const result = parseCartAddresses(formData);
      expect(result.isSameAsBilling).toBe(false);
      expect(result.billing_address.first_name).toBe('Mehmet');
      expect(result.billing_address.last_name).toBe('Demir');
      expect(result.billing_address.address_1).toBe('Inonu Bulvari No: 5');
      // Falls back safely to shipping address values
      expect(result.billing_address.city).toBe('Istanbul');
      expect(result.billing_address.postal_code).toBe('34000');
      expect(result.billing_address.country_code).toBe('tr');
    });

    it('trims whitespace and treats empty strings as undefined for optional fields', () => {
      const formData = new MockFormData({
        'shipping_address.first_name': '  Ayse  ',
        'shipping_address.last_name': ' Kaya ',
        'shipping_address.address_1': ' Bagdat Cad. ',
        'shipping_address.postal_code': '34710',
        'shipping_address.city': 'Istanbul',
        'shipping_address.country_code': 'tr',
        same_as_billing: 'true',
        email: '  ayse@example.com  ',
      });

      const result = parseCartAddresses(formData);
      expect(result.shipping_address.first_name).toBe('Ayse');
      expect(result.shipping_address.last_name).toBe('Kaya');
      expect(result.shipping_address.address_1).toBe('Bagdat Cad.');
      expect(result.email).toBe('ayse@example.com');
      expect(result.billing_address.first_name).toBe('Ayse');
    });
  });

  describe('shouldNavigateToDelivery (#163)', () => {
    it('returns true only when result is explicitly successful', () => {
      const successResult: SetAddressesResult = { success: true };
      expect(shouldNavigateToDelivery(successResult)).toBe(true);
    });

    it('returns false when result indicates failure with error message', () => {
      const failureResult: SetAddressesResult = {
        success: false,
        error: 'Postal code is invalid',
      };
      expect(shouldNavigateToDelivery(failureResult)).toBe(false);
    });

    it('returns false when result is null, undefined, or empty', () => {
      expect(shouldNavigateToDelivery(null)).toBe(false);
      expect(shouldNavigateToDelivery(undefined)).toBe(false);
      expect(shouldNavigateToDelivery({ success: false })).toBe(false);
    });

    it('prevents navigation on backend network/server error (#163)', () => {
      const serverError: SetAddressesResult = {
        success: false,
        error: 'Unable to save address',
      };
      expect(shouldNavigateToDelivery(serverError)).toBe(false);
    });
  });
});

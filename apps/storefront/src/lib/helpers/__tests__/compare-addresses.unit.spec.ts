import { describe, expect, it } from 'bun:test';
import compareAddresses, { ADDRESS_COMPARE_FIELDS } from '../compare-addresses';

describe('compareAddresses helper (#164)', () => {
  const baseAddress = {
    first_name: 'Ahmet',
    last_name: 'Yilmaz',
    address_1: 'Ataturk Cad. No: 12',
    address_2: 'Daire 4',
    company: 'DogruAdres AS',
    postal_code: '34000',
    city: 'Istanbul',
    country_code: 'tr',
    province: 'Istanbul',
    phone: '+905551234567',
  };

  it('includes all 10 canonical address fields in comparison', () => {
    expect(ADDRESS_COMPARE_FIELDS).toEqual([
      'first_name',
      'last_name',
      'address_1',
      'address_2',
      'company',
      'postal_code',
      'city',
      'country_code',
      'province',
      'phone',
    ]);
  });

  it('returns true when all 10 address fields match', () => {
    expect(compareAddresses(baseAddress, { ...baseAddress })).toBe(true);
  });

  it('returns false when company differs', () => {
    expect(
      compareAddresses(baseAddress, {
        ...baseAddress,
        company: 'Fatura LTD',
      })
    ).toBe(false);
  });

  it('returns false when postal_code differs', () => {
    expect(
      compareAddresses(baseAddress, {
        ...baseAddress,
        postal_code: '06000',
      })
    ).toBe(false);
  });

  it('returns false when province differs', () => {
    expect(
      compareAddresses(baseAddress, {
        ...baseAddress,
        province: 'Ankara',
      })
    ).toBe(false);
  });

  it('returns false when address_2 differs', () => {
    expect(
      compareAddresses(baseAddress, {
        ...baseAddress,
        address_2: 'Kat 5',
      })
    ).toBe(false);
  });

  it('returns false when phone differs', () => {
    expect(
      compareAddresses(baseAddress, {
        ...baseAddress,
        phone: '+905559876543',
      })
    ).toBe(false);
  });

  it('returns false when either address is null or undefined', () => {
    expect(compareAddresses(baseAddress, null)).toBe(false);
    expect(compareAddresses(null, baseAddress)).toBe(false);
    expect(compareAddresses(undefined, undefined)).toBe(false);
  });
});

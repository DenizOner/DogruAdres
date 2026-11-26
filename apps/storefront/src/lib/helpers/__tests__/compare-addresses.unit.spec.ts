import { describe, expect, it } from 'bun:test';
import compareAddresses, {
  ADDRESS_COMPARE_FIELDS,
  normalizeAddressValue,
} from '../compare-addresses';

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

  describe('normalizeAddressValue', () => {
    it('normalizes null, undefined and whitespace-only strings to empty string', () => {
      expect(normalizeAddressValue(null)).toBe('');
      expect(normalizeAddressValue(undefined)).toBe('');
      expect(normalizeAddressValue('')).toBe('');
      expect(normalizeAddressValue('   ')).toBe('');
    });

    it('trims whitespace and lowercases values', () => {
      expect(normalizeAddressValue('  TR  ')).toBe('tr');
      expect(normalizeAddressValue(' Istanbul ')).toBe('istanbul');
    });
  });

  describe('compareAddresses functionality', () => {
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

    it('matches database address with null optional fields against form address with undefined or empty string', () => {
      const dbAddress = {
        first_name: 'Ahmet',
        last_name: 'Yilmaz',
        address_1: 'Ataturk Cad. No: 12',
        address_2: null,
        company: null,
        postal_code: '34000',
        city: 'Istanbul',
        country_code: 'TR',
        province: null,
        phone: null,
      };

      const formInput = {
        first_name: 'Ahmet',
        last_name: 'Yilmaz',
        address_1: 'Ataturk Cad. No: 12',
        address_2: undefined,
        company: '',
        postal_code: '34000',
        city: 'Istanbul',
        country_code: 'tr',
        province: '',
        phone: undefined,
      };

      expect(compareAddresses(dbAddress, formInput)).toBe(true);
    });

    it('matches country codes regardless of uppercase/lowercase', () => {
      expect(
        compareAddresses(
          { ...baseAddress, country_code: 'TR' },
          { ...baseAddress, country_code: 'tr' }
        )
      ).toBe(true);
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
});

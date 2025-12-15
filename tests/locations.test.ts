/**
 * Location Constants Tests
 * 
 * Tests for the country/region lookup utilities.
 * 
 * FILE LOCATION: tests/locations.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  COUNTRIES,
  COUNTRY_REGIONS,
  getRegionsForCountry,
  getCountryName,
} from '../constants/locations';

// ============================================
// COUNTRIES Tests
// ============================================

describe('COUNTRIES', () => {
  it('contains expected countries', () => {
    const countryCodes = COUNTRIES.map(c => c.code);
    
    expect(countryCodes).toContain('NZL');
    expect(countryCodes).toContain('AUS');
    expect(countryCodes).toContain('USA');
    expect(countryCodes).toContain('GBR');
  });

  it('each country has code and name', () => {
    COUNTRIES.forEach(country => {
      expect(country.code).toBeDefined();
      expect(country.name).toBeDefined();
      expect(country.code.length).toBe(3); // ISO 3166-1 alpha-3
      expect(country.name.length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate codes', () => {
    const codes = COUNTRIES.map(c => c.code);
    const uniqueCodes = new Set(codes);
    
    expect(codes.length).toBe(uniqueCodes.size);
  });
});

// ============================================
// COUNTRY_REGIONS Tests
// ============================================

describe('COUNTRY_REGIONS', () => {
  it('has regions for New Zealand', () => {
    const nzRegions = COUNTRY_REGIONS['NZL'];
    
    expect(nzRegions).toBeDefined();
    expect(nzRegions.length).toBeGreaterThan(0);
    expect(nzRegions).toContain('Canterbury');
    expect(nzRegions).toContain('Auckland');
    expect(nzRegions).toContain('Wellington');
  });

  it('has regions for Australia', () => {
    const ausRegions = COUNTRY_REGIONS['AUS'];
    
    expect(ausRegions).toBeDefined();
    expect(ausRegions).toContain('New South Wales');
    expect(ausRegions).toContain('Victoria');
    expect(ausRegions).toContain('Queensland');
  });

  it('has regions for USA', () => {
    const usaRegions = COUNTRY_REGIONS['USA'];
    
    expect(usaRegions).toBeDefined();
    expect(usaRegions).toContain('California');
    expect(usaRegions).toContain('Texas');
    expect(usaRegions).toContain('New York');
  });

  it('each country in COUNTRIES has regions defined', () => {
    COUNTRIES.forEach(country => {
      const regions = COUNTRY_REGIONS[country.code];
      expect(regions).toBeDefined();
      expect(Array.isArray(regions)).toBe(true);
    });
  });
});

// ============================================
// getRegionsForCountry Tests
// ============================================

describe('getRegionsForCountry', () => {
  it('returns regions for valid country code', () => {
    const regions = getRegionsForCountry('NZL');
    
    expect(regions.length).toBeGreaterThan(0);
    expect(regions).toContain('Canterbury');
  });

  it('returns empty array for invalid country code', () => {
    const regions = getRegionsForCountry('INVALID');
    
    expect(regions).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    const regions = getRegionsForCountry('');
    
    expect(regions).toEqual([]);
  });
});

// ============================================
// getCountryName Tests
// ============================================

describe('getCountryName', () => {
  it('returns country name for valid code', () => {
    expect(getCountryName('NZL')).toBe('New Zealand');
    expect(getCountryName('AUS')).toBe('Australia');
    expect(getCountryName('USA')).toBe('United States');
    expect(getCountryName('GBR')).toBe('United Kingdom');
  });

  it('returns the code itself for invalid code', () => {
    expect(getCountryName('INVALID')).toBe('INVALID');
    expect(getCountryName('XXX')).toBe('XXX');
  });

  it('returns empty string for empty input', () => {
    expect(getCountryName('')).toBe('');
  });
});

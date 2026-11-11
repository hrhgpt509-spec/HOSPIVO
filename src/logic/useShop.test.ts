import 'fake-indexeddb/auto';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { useShop, getShopData, type UseShopResult } from './useShop';

describe('useShop hook & shop queries', () => {
  beforeEach(async () => {
    db.close();
    await db.delete();
    await db.open();
  });

  it('provides empty defaults when shop table is empty', () => {
    let captured: UseShopResult | null = null;
    const TestComponent = () => {
      captured = useShop();
      return React.createElement('div', null, captured.name || 'EMPTY');
    };

    renderToString(React.createElement(TestComponent));

    expect(captured).not.toBeNull();
    expect(captured!.shop).toBeNull();
    expect(captured!.name).toBe('');
    expect(captured!.ownerName).toBe('');
    expect(captured!.address).toBe('');
    expect(captured!.phone).toBe('');
    expect(captured!.gstNo).toBe('');
    expect(captured!.drugLicenceNos).toBe('');
    expect(captured!.mode).toBe('');
  });

  it('reads shop fields correctly via getShopData when a record exists', async () => {
    await db.shop.add({
      name: 'Ramesh Medical Store',
      ownerName: 'Ramesh Gupta',
      address: 'Main Bazaar, Samastipur',
      phone: '9876543210',
      gstNo: '10ABCDE1234F1Z5',
      drugLicenceNos: 'BR-SAM-12345',
      mode: 'local',
    });

    const data = await getShopData();
    expect(data).not.toBeNull();
    expect(data?.name).toBe('Ramesh Medical Store');
    expect(data?.ownerName).toBe('Ramesh Gupta');
    expect(data?.address).toBe('Main Bazaar, Samastipur');
    expect(data?.phone).toBe('9876543210');
    expect(data?.gstNo).toBe('10ABCDE1234F1Z5');
    expect(data?.drugLicenceNos).toBe('BR-SAM-12345');
    expect(data?.mode).toBe('local');
  });

  it('returns null from getShopData if shop table is empty', async () => {
    const data = await getShopData();
    expect(data).toBeNull();
  });
});

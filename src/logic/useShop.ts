import { useState, useEffect, useCallback } from 'react';
import { db, type Shop } from '../db';

export interface UseShopResult {
  shop: Shop | null;
  name: string;
  ownerName: string;
  address: string;
  phone: string;
  gstNo: string;
  drugLicenceNos: string;
  mode: 'local' | 'cloud' | '';
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export async function getShopData(): Promise<Shop | null> {
  try {
    const record = await db.shop.toCollection().first();
    return record || null;
  } catch {
    return null;
  }
}

export function useShop(): UseShopResult {
  const [shop, setShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchShop = useCallback(async () => {
    try {
      const record = await getShopData();
      setShop(record);
    } catch {
      setShop(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShop();
  }, [fetchShop]);

  return {
    shop,
    name: shop?.name || '',
    ownerName: shop?.ownerName || '',
    address: shop?.address || '',
    phone: shop?.phone || '',
    gstNo: shop?.gstNo || '',
    drugLicenceNos: shop?.drugLicenceNos || '',
    mode: shop?.mode || '',
    isLoading,
    refetch: fetchShop,
  };
}

export default useShop;

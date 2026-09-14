import { useEffect } from 'react';
import { warmupWarehouse } from '../lib/warmup';

/** VR WarehouseWarmup — mounted once at app root */
export function WarehouseWarmup() {
  useEffect(() => {
    warmupWarehouse();
  }, []);
  return null;
}

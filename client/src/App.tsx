import { WarehouseWarmup } from './components/WarehouseWarmup';

/**
 * SC Manufacturing Console — application entry.
 * Data: useAnalyticsQuery / useSummary (see src/hooks/).
 * UI: legacy/console.js loaded from index.html.
 */
export default function App() {
  return <WarehouseWarmup />;
}

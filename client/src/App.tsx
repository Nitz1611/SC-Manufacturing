import { WarehouseWarmup } from './components/WarehouseWarmup';

/**
 * SC Manufacturing Console — VR architecture entry point.
 *
 * Data layer (VR standard):
 *   POST /api/analytics/query/:queryKey  — direct SQL (cache fallback in dev)
 *   POST /api/summaries                  — tab-specific AI narratives
 *   GET  /api/warmup                     — warehouse pre-warm
 *
 * UI: legacy/console.js (loaded via index.html script tag) preserves full
 * Manufacturing Console look, feel, and KPI tab functionality during migration.
 */
export default function App() {
  return <WarehouseWarmup />;
}

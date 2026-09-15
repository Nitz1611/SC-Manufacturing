import { initManufacturingConsole } from '../client/src/lib/console/engine.ts';

function onReady(): void {
  initManufacturingConsole();
  document.body.classList.add('app-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  onReady();
}

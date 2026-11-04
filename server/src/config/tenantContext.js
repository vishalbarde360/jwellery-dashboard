import { AsyncLocalStorage } from 'node:async_hooks';

// Holds { tenantId } for the current request, or { bypass: true } for the seed script.
export const tenantStore = new AsyncLocalStorage();
export const currentTenant = () => tenantStore.getStore();

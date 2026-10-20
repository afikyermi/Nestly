import type { App } from './identity-fixtures.js';

// The one place the blocking tests learn the URLs (FR-REL-002): PUT|DELETE /api/users/:id/block and GET /api/blocks.

export const blockUrl = (id: string): string => `/api/users/${id}/block`;
export const BLOCKS_URL = '/api/blocks';

const headersOf = (header: string | null): Record<string, string> => (header === null ? {} : { authorization: header });

export const putBlock = (app: App, header: string | null, id: string) => app.inject({ method: 'PUT', url: blockUrl(id), headers: headersOf(header) });
export const deleteBlock = (app: App, header: string | null, id: string) => app.inject({ method: 'DELETE', url: blockUrl(id), headers: headersOf(header) });
export const getBlocks = (app: App, header: string | null) => app.inject({ method: 'GET', url: BLOCKS_URL, headers: headersOf(header) });

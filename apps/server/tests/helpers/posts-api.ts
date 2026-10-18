import { toRecord, type App } from './identity-fixtures.js';

// The one place the F3.1a tests learn the API's URLs (.work/post-create/spec.md Scope: POST /posts, GET|PATCH|DELETE /posts/:id).
// Every route of this server sits under `/api` (see helpers/friends-api.ts); that prefix is the one assumption made here.

export const POSTS_URL = '/api/posts';
export const postUrl = (id: string): string => `${POSTS_URL}/${id}`;

const headersOf = (header: string | null, json: boolean): Record<string, string> => ({
  ...(header === null ? {} : { authorization: header }),
  ...(json ? { 'content-type': 'application/json' } : {}),
});
const bodyOf = (payload: unknown): string => (typeof payload === 'string' ? payload : JSON.stringify(payload));

export const createPost = (app: App, header: string | null, payload: unknown) =>
  app.inject({ method: 'POST', url: POSTS_URL, headers: headersOf(header, true), payload: bodyOf(payload) });
export const patchPost = (app: App, header: string | null, id: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url: postUrl(id), headers: headersOf(header, true), payload: bodyOf(payload) });
export const getPost = (app: App, header: string | null, id: string) => app.inject({ method: 'GET', url: postUrl(id), headers: headersOf(header, false) });
export const deletePost = (app: App, header: string | null, id: string) => app.inject({ method: 'DELETE', url: postUrl(id), headers: headersOf(header, false) });

/** The parsed JSON object of an answer; throws (a failed test) if it is not one. */
export const jsonObject = (body: string): Record<string, unknown> => toRecord(JSON.parse(body));

// Search (FR-SEARCH-001, FR-ALG-008, VAL-037, NFR-SEC-006).

/** The shortest and longest search text. Shorter returns nothing and is not counted: there is no list of users without a query (AC-078). */
export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;

/** The tabs of the results screen, and what one request asks for. */
export const SEARCH_TYPES = ['all', 'people', 'groups', 'posts'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Results per request (NFR-SEC-006 (3)): the dropdown shows the first few, the results screen all of these. */
export const SEARCH_RESULT_LIMIT = 20;

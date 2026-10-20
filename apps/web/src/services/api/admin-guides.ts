import { adminGuidesResponse, type AdminGuideDto } from '@nestly/shared';
import { request, saved } from './trackers';

// GET /api/guides/manage, POST /api/guides/manage, PUT /api/guides/manage/:id (FR-ADMIN-012). No user id is sent; the server acts on the
// token's user and the database lets only an Admin through.
export interface GuideBody {
  stageKind: string;
  rangeFrom: number | null;
  rangeTo: number | null;
  title: string;
  body: string;
  source: string;
  sourceCheckedOn: string | null;
}

export const fetchGuides = (token: string) =>
  request(token, 'GET', '/api/guides/manage', undefined, (json): AdminGuideDto[] | null => {
    const result = adminGuidesResponse.safeParse(json);
    return result.success ? result.data.guides : null;
  });
export const createGuide = (token: string, body: GuideBody) => request(token, 'POST', '/api/guides/manage', body, saved);
export const saveGuide = (token: string, id: string, body: GuideBody & { status: string }) => request(token, 'PUT', `/api/guides/manage/${id}`, body, saved);

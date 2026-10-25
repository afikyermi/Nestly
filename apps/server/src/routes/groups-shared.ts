// The Groups routes' shared answers (I10): a refusal by its kind, the identity guard and the path readers.


import { groupDetail, groupPathParams, groupUserPathParams } from '@nestly/shared';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.js';
import type { Identity } from '../lib/token-verifier.js';
import { isTransientFailure, readDatabaseFault } from '../lib/pg-error.js';
import { replySessionRefused } from '../plugins/authentication.js';
import type { MediaStorage } from '../media/storage-admin.js';
import type { GroupFailure, GroupResult } from '../services/groups-service.js';

export interface GroupsRouteDependencies {
  readonly database: Database | undefined;
  readonly storage?: MediaStorage;
}

const STATUS: Record<GroupFailure['kind'], number> = {
  invalid: 400,
  group_unavailable: 404,
  user_unavailable: 404,
  not_allowed: 403,
  role_not_allowed: 403,
  blocked_from_group: 403,
  owner_must_transfer: 409,
  already_requested: 409,
  already_member: 409,
  not_a_friend: 422,
  muted: 403,
  invitation_unavailable: 409,
  stopped: 403,
  forbidden: 403,
};

export function replyFailure(reply: FastifyReply, failure: GroupFailure): FastifyReply {
  const error = failure.kind === 'stopped' ? 'account_unavailable' : failure.kind;
  return reply.code(STATUS[failure.kind]).send({ error });
}

export function send<T>(reply: FastifyReply, result: GroupResult<T>, onOk: (value: T) => FastifyReply): FastifyReply {
  return result.kind === 'ok' ? onOk(result.value) : replyFailure(reply, result);
}

export type Work = (database: Database, identity: Identity, request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>;

/** The per-app helpers: the identity guard (503 without a database or identity, the session refusals, 500/503 on a fault) and the path readers. */
export function groupsHelpers(deps: GroupsRouteDependencies) {
  const guarded = (line: string, work: Work) => async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('cache-control', 'private, no-store');
    const { identity } = request;
    if (identity === null || deps.database === undefined) return reply.code(503).send({ error: 'unavailable' });
    try {
      return await work(deps.database, identity, request, reply);
    } catch (error) {
      const refused = replySessionRefused(reply, error);
      if (refused !== undefined) return refused;
      request.log.error({ sqlstate: readDatabaseFault(error)?.code }, line);
      if (isTransientFailure(error)) return reply.code(503).send({ error: 'unavailable' });
      return reply.code(500).send({ error: 'server_error' });
    }
  };
  const invalid = (reply: FastifyReply) => reply.code(400).send({ error: 'invalid' });
  const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'group_unavailable' });
  const noBody = (request: FastifyRequest) => request.body === undefined || request.body === null;
  const groupId = (request: FastifyRequest) => {
    const p = groupPathParams.safeParse(request.params);
    return p.success ? p.data.id.toLowerCase() : null;
  };
  const groupUser = (request: FastifyRequest) => {
    const p = groupUserPathParams.safeParse(request.params);
    return p.success ? { id: p.data.id.toLowerCase(), userId: p.data.userId.toLowerCase() } : null;
  };
  const detailOk = (reply: FastifyReply, code = 200) => (value: z.infer<typeof groupDetail>) => reply.code(code).send(groupDetail.parse(value));
  const noContent = (reply: FastifyReply) => () => reply.code(204).send();

  return { guarded, invalid, notFound, noBody, groupId, groupUser, detailOk, noContent };
}

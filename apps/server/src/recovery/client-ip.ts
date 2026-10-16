// The client address, as the recovery limits and the audit see it (F1.6; schema.md "IP hash input"). The address comes
// from `request.ip`, which Fastify derives with `trustProxy` (app.ts): the one entry the platform itself added to
// X-Forwarded-For, never a client-supplied leftmost one. Only the hash of `key` is ever stored; the address is never logged.

import { isIPv4, isIPv6 } from 'node:net';

export interface ClientAddress {
  /** The text the IP hash covers: an IPv4 address, or an IPv6 address cut to its /64. `unknown` when `ip` is no address. */
  readonly key: string;
  /** The address as Auth should count it, or undefined when `ip` is no address. */
  readonly forAuth: string | undefined;
}

const IPV6_GROUPS = 8;
const GROUP = /^[0-9a-f]{1,4}$/i;

function ipv4Groups(address: string): number[] {
  const [a = 0, b = 0, c = 0, d = 0] = address.split('.').map(Number);
  return [a * 256 + b, c * 256 + d];
}

function groupsOf(text: string): number[] | undefined {
  if (text === '') return [];
  const groups: number[] = [];
  for (const part of text.split(':')) {
    if (part.includes('.')) groups.push(...ipv4Groups(part));
    else if (GROUP.test(part)) groups.push(parseInt(part, 16));
    else return undefined;
  }
  return groups;
}

/** The eight 16-bit groups of a valid IPv6 address, or undefined. A zone id (`%eth0`) is ignored. */
function expandIpv6(address: string): number[] | undefined {
  const halves = (address.split('%')[0] ?? '').split('::');
  if (halves.length > 2) return undefined;
  const head = groupsOf(halves[0] ?? '');
  const tail = halves.length === 2 ? groupsOf(halves[1] ?? '') : [];
  if (head === undefined || tail === undefined) return undefined;
  if (halves.length === 1) return head.length === IPV6_GROUPS ? head : undefined;
  const missing = IPV6_GROUPS - head.length - tail.length;
  return missing < 1 ? undefined : [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function isIpv4Mapped(groups: readonly number[]): boolean {
  return groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
}

export function clientAddress(ip: string): ClientAddress {
  if (isIPv4(ip)) return { key: `v4:${ip}`, forAuth: ip };
  if (isIPv6(ip)) {
    const groups = expandIpv6(ip);
    if (groups !== undefined) {
      if (isIpv4Mapped(groups)) {
        const [high = 0, low = 0] = groups.slice(6);
        return { key: `v4:${Math.floor(high / 256)}.${high % 256}.${Math.floor(low / 256)}.${low % 256}`, forAuth: ip };
      }
      // One host holds 2^64 addresses: the per-address limit counts the /64 prefix.
      return { key: `v6:${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}`, forAuth: ip };
    }
  }
  return { key: 'unknown', forAuth: undefined };
}

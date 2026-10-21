import {timingSafeEqual} from 'node:crypto';import type {GmailConnection} from '@prisma/client';import {prisma} from '@/lib/db';
export interface GmailThreadAttachment{id:string;subject:string;url:string;lastMessageAt:string;notes:string;gmailThreadId?:string;syncedAt?:string;lastSender?:string;}
export interface GmailThreadMetadata{threadId:string;subject:string;lastMessageAt:string;lastSender:string;}
export const GMAIL_STATE_COOKIE='sample-only';export const gmailScopes=()=> 'local-simulation';export function buildGoogleOAuthUrl(..._args:unknown[]):URL{throw Error('OAuth removed from public sample');}
export async function getValidGmailAccessToken(userId:string){const connection=await prisma.gmailConnection.findUnique({where:{userId}});if(!connection)throw Error('Connect the simulated mailbox first');return {accessToken:'simulation-no-credential',connection};}
export async function fetchGmailThreadMetadata({threadId}:{threadId:string;accessToken:string}):Promise<GmailThreadMetadata>{return {threadId,subject:'[Simulation] Fictional campaign brief',lastMessageAt:'2026-10-20',lastSender:'sample-creator@example.invalid'};}
export function extractGmailThreadId(input: string) {
  const value = input.trim();
  if (!value) return "";

  try {
    const url = new URL(value);
    for (const key of ["threadId", "th"]) {
      const param = url.searchParams.get(key);
      if (param) return cleanThreadId(param);
    }

    const hashTail = url.hash.split("/").filter(Boolean).pop();
    if (hashTail) return cleanThreadId(hashTail);

    const pathTail = url.pathname.split("/").filter(Boolean).pop();
    if (pathTail) return cleanThreadId(pathTail);
  } catch {
    // Fall through to raw id handling.
  }

  return cleanThreadId(value);
}

export function secureCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function gmailConnectionStatus(connection: GmailConnection | null) {
  return connection
    ? {
        connected: true,
        email: connection.gmailEmail,
        scope: connection.scope,
        connectedAt: connection.connectedAt.toISOString(),
        expiresAt: connection.expiresAt?.toISOString() ?? null,
        lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
      }
    : {
        connected: false,
        email: null,
        scope: "",
        connectedAt: null,
        expiresAt: null,
        lastSyncedAt: null,
      };
}

function cleanThreadId(value: string) {
  return decodeURIComponent(value)
    .replace(/^thread-f:/, "")
    .replace(/[?#].*$/, "")
    .trim();
}


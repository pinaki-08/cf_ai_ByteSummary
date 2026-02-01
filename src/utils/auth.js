/**
 * Authentication utilities
 */

import { COOKIE_NAME } from '../config/constants.js';

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "bytesummary_salt_v1");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyPassword(password, hash) {
  const newHash = await hashPassword(password);
  return newHash === hash;
}

export function getSessionFromCookie(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getUserFromRequest(request, env) {
  const sessionId = getSessionFromCookie(request);
  if (!sessionId) return null;
  
  const sessionData = await env.SUMMARIES_CACHE.get(`session:${sessionId}`);
  if (!sessionData) return null;
  
  return JSON.parse(sessionData);
}

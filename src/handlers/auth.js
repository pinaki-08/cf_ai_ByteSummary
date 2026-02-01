/**
 * Authentication handlers
 */

import { jsonResponse } from '../utils/http.js';
import { hashPassword, verifyPassword, getSessionFromCookie } from '../utils/auth.js';
import { COOKIE_NAME, SESSION_EXPIRY } from '../config/constants.js';

export async function handleRegister(request, env) {
  try {
    const { email, password, name } = await request.json();
    
    if (!email || !password || !name) {
      return jsonResponse({ error: "Email, password, and name are required" }, 400);
    }
    
    const existingUser = await env.SUMMARIES_CACHE.get(`user:${email}`);
    if (existingUser) {
      return jsonResponse({ error: "User already exists" }, 400);
    }
    
    const userId = crypto.randomUUID();
    const user = {
      id: userId,
      email,
      name,
      password: await hashPassword(password),
      createdAt: new Date().toISOString()
    };
    
    await env.SUMMARIES_CACHE.put(`user:${email}`, JSON.stringify(user));
    
    const sessionId = crypto.randomUUID();
    await env.SUMMARIES_CACHE.put(`session:${sessionId}`, JSON.stringify({
      userId,
      email,
      name
    }), { expirationTtl: SESSION_EXPIRY });
    
    const response = jsonResponse({ success: true, user: { email, name } });
    response.headers.set("Set-Cookie", `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY}`);
    return response;
  } catch (error) {
    return jsonResponse({ error: "Registration failed" }, 500);
  }
}

export async function handleLogin(request, env) {
  try {
    const { email, password } = await request.json();
    
    const userData = await env.SUMMARIES_CACHE.get(`user:${email}`);
    if (!userData) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const user = JSON.parse(userData);
    const isValid = await verifyPassword(password, user.password);
    
    if (!isValid) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }
    
    const sessionId = crypto.randomUUID();
    await env.SUMMARIES_CACHE.put(`session:${sessionId}`, JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name
    }), { expirationTtl: SESSION_EXPIRY });
    
    const response = jsonResponse({ success: true, user: { email: user.email, name: user.name } });
    response.headers.set("Set-Cookie", `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_EXPIRY}`);
    return response;
  } catch (error) {
    return jsonResponse({ error: "Login failed" }, 500);
  }
}

export function handleLogout() {
  const response = jsonResponse({ success: true });
  response.headers.set("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  return response;
}

export async function handleGetCurrentUser(request, env) {
  const sessionId = getSessionFromCookie(request);
  if (!sessionId) {
    return jsonResponse({ user: null });
  }
  
  const sessionData = await env.SUMMARIES_CACHE.get(`session:${sessionId}`);
  if (!sessionData) {
    return jsonResponse({ user: null });
  }
  
  const session = JSON.parse(sessionData);
  return jsonResponse({ user: { email: session.email, name: session.name } });
}

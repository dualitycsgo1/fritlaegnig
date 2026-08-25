// @ts-nocheck
/**
 * Second line of defense: Nitro also refuses unauthenticated HTML/API.
 * Static /assets on Vercel are gated by the Edge middleware attached in
 * scripts/attach-site-lock.mjs — this catches SSR and function hits.
 */
import { handleFetch } from "../../scripts/site-lock-core.mjs";

export default async function siteLockMiddleware(event, next) {
  const result = await handleFetch(event.req);
  if (result) return result;
  return next();
}

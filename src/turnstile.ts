// Server-side check of a Turnstile token. Fails closed: no secret or no token means no.
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string | undefined): Promise<boolean> {
  if (!env.TURNSTILE_SECRET || !token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

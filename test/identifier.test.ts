import assert from "node:assert/strict";
import test from "node:test";
import { twoFactor, username } from "better-auth/plugins";
import { identifier, MAX_IDENTIFIER_LENGTH } from "../src/index.js";
import { PASSWORD, post, setup, signUp } from "./helpers.js";

async function ok(res: Response) {
  assert.equal(res.status, 200);
  return (await res.json()) as { token: string; redirect: boolean; url?: string; user: { email: string; username: string } };
}

test("signs in by email", async () => {
  const { auth } = setup();
  await signUp(auth);
  const body = await ok(await post(auth, { identifier: "ada@example.com", password: PASSWORD }));
  assert.equal(body.user.email, "ada@example.com");
  assert.equal(body.redirect, false);
  assert.ok(body.token);
});

test("signs in by email in a different case", async () => {
  const { auth } = setup();
  await signUp(auth);
  await ok(await post(auth, { identifier: "ADA@Example.COM", password: PASSWORD }));
});

test("signs in by username", async () => {
  const { auth } = setup();
  await signUp(auth);
  const body = await ok(await post(auth, { identifier: "ada_l", password: PASSWORD }));
  assert.equal(body.user.username, "ada_l");
});

test("signs in by username in a different case", async () => {
  const { auth } = setup();
  await signUp(auth);
  await ok(await post(auth, { identifier: "ADA_L", password: PASSWORD }));
});

test("trims surrounding whitespace", async () => {
  const { auth } = setup();
  await signUp(auth);
  await ok(await post(auth, { identifier: "  ada_l  ", password: PASSWORD }));
});

test("response has the same shape as /sign-in/email", async () => {
  const { auth } = setup();
  await signUp(auth);
  const viaEmail = await (
    await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "ada@example.com", password: PASSWORD }),
      }),
    )
  ).json();
  const viaIdentifier = await ok(await post(auth, { identifier: "ada_l", password: PASSWORD }));
  assert.deepEqual(Object.keys(viaIdentifier).sort(), Object.keys(viaEmail as object).sort());
  assert.deepEqual(Object.keys(viaIdentifier.user).sort(), Object.keys((viaEmail as { user: object }).user).sort());
});

test("callbackURL sets redirect, url and Location", async () => {
  const { auth } = setup({ auth: { trustedOrigins: ["http://localhost:3000"] } });
  await signUp(auth);
  const res = await post(auth, { identifier: "ada_l", password: PASSWORD, callbackURL: "/dashboard" });
  const body = await ok(res);
  assert.equal(body.redirect, true);
  assert.equal(body.url, "/dashboard");
  assert.equal(res.headers.get("location"), "/dashboard");
});

test("sets a session cookie that /get-session accepts", async () => {
  const { auth } = setup();
  await signUp(auth);
  const res = await post(auth, { identifier: "ada_l", password: PASSWORD });
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  assert.match(cookie, /better-auth\.session_token=/);
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session?.user.email, "ada@example.com");
});

test("rememberMe: false gives a session cookie without Max-Age", async () => {
  const { auth } = setup();
  await signUp(auth);
  const res = await post(auth, { identifier: "ada_l", password: PASSWORD, rememberMe: false });
  const token = res.headers.getSetCookie().find((c) => c.includes("session_token"));
  assert.ok(token);
  assert.doesNotMatch(token, /Max-Age/i);
  const remembered = await post(auth, { identifier: "ada_l", password: PASSWORD });
  assert.match(remembered.headers.getSetCookie().find((c) => c.includes("session_token")) ?? "", /Max-Age/i);
});

test("wrong password, unknown email and unknown username give the identical response", async () => {
  const { auth } = setup();
  await signUp(auth);
  const results = [];
  for (const body of [
    { identifier: "ada@example.com", password: "wrong-password" },
    { identifier: "ada_l", password: "wrong-password" },
    { identifier: "nobody@example.com", password: PASSWORD },
    { identifier: "nobody", password: PASSWORD },
  ]) {
    const res = await post(auth, body);
    results.push({ status: res.status, body: await res.text() });
  }
  assert.equal(results[0]?.status, 401);
  assert.match(results[0]!.body, /INVALID_EMAIL_OR_PASSWORD/);
  for (const r of results) assert.deepEqual(r, results[0]);
});

test("a user without a credential account gets the same error", async () => {
  const { auth, db } = setup();
  await signUp(auth);
  db.account!.length = 0;
  const res = await post(auth, { identifier: "ada_l", password: PASSWORD });
  assert.equal(res.status, 401);
  assert.match(await res.text(), /INVALID_EMAIL_OR_PASSWORD/);
});

test("a missing user costs about as much as a wrong password", async () => {
  const { auth } = setup();
  await signUp(auth);
  const time = async (identifier: string) => {
    const t = process.hrtime.bigint();
    for (let i = 0; i < 4; i++) await post(auth, { identifier, password: "wrong-password" });
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  await time("ada_l");
  const known = await time("ada_l");
  const unknown = await time("nobody");
  assert.ok(unknown > known * 0.5, `unknown ${unknown.toFixed(0)}ms vs known ${known.toFixed(0)}ms`);
});

test("requireEmailVerification: unverified user gets 403 and a verification email on sign-in", async () => {
  const sent: string[] = [];
  const { auth } = setup({
    auth: {
      emailAndPassword: { enabled: true, requireEmailVerification: true },
      emailVerification: {
        sendOnSignIn: true,
        sendVerificationEmail: async ({ user }) => {
          sent.push(user.email);
        },
      },
    },
  });
  await signUp(auth);
  sent.length = 0;
  for (const id of ["ada_l", "ada@example.com"]) {
    const res = await post(auth, { identifier: id, password: PASSWORD });
    assert.equal(res.status, 403);
    assert.match(await res.text(), /EMAIL_NOT_VERIFIED/);
  }
  assert.deepEqual(sent, ["ada@example.com", "ada@example.com"]);
});

test("requireEmailVerification: a wrong password is 401, not 403", async () => {
  const { auth } = setup({ auth: { emailAndPassword: { enabled: true, requireEmailVerification: true } } });
  await signUp(auth);
  const res = await post(auth, { identifier: "ada_l", password: "wrong-password" });
  assert.equal(res.status, 401);
});

test("requireEmailVerification: a verified user signs in", async () => {
  const { auth, db } = setup({ auth: { emailAndPassword: { enabled: true, requireEmailVerification: true } } });
  await signUp(auth);
  db.user![0]!.emailVerified = true;
  await ok(await post(auth, { identifier: "ada_l", password: PASSWORD }));
});

test("rejects an empty or blank identifier", async () => {
  const { auth } = setup();
  for (const id of ["", "   "]) {
    const res = await post(auth, { identifier: id, password: PASSWORD });
    assert.equal(res.status, 400);
    assert.match(await res.text(), /IDENTIFIER_REQUIRED/);
  }
});

test("rejects an identifier over the length cap, accepts one at the cap", async () => {
  const { auth } = setup();
  const over = await post(auth, { identifier: "a".repeat(MAX_IDENTIFIER_LENGTH + 1), password: PASSWORD });
  assert.equal(over.status, 400);
  assert.match(await over.text(), /IDENTIFIER_TOO_LONG/);
  const at = await post(auth, { identifier: "a".repeat(MAX_IDENTIFIER_LENGTH), password: PASSWORD });
  assert.equal(at.status, 401);
});

test("rejects a password over the configured maximum", async () => {
  const { auth } = setup();
  const res = await post(auth, { identifier: "ada_l", password: "x".repeat(200) });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /PASSWORD_TOO_LONG/);
});

test("rejects a missing or non-string field", async () => {
  const { auth } = setup();
  assert.equal((await post(auth, { password: PASSWORD })).status, 400);
  assert.equal((await post(auth, { identifier: 42, password: PASSWORD })).status, 400);
});

test("custom usernameNormalization on the username plugin is honoured", async () => {
  const { auth } = setup({
    plugins: [username({ usernameNormalization: (u) => u.replaceAll(".", "").toLowerCase() }), identifier()],
  });
  await signUp(auth, "ada@example.com", "a.d.a");
  await ok(await post(auth, { identifier: "A.D.A", password: PASSWORD }));
  await ok(await post(auth, { identifier: "ada", password: PASSWORD }));
});

test("identifier's own usernameNormalization overrides the username plugin's", async () => {
  const { auth } = setup({
    plugins: [username({ usernameNormalization: false }), identifier({ usernameNormalization: (u) => u.toUpperCase() })],
  });
  await signUp(auth, "ada@example.com", "ADA_L");
  await ok(await post(auth, { identifier: "ada_l", password: PASSWORD }));
});

test("usernameNormalization: false matches the exact case only", async () => {
  const { auth } = setup({ plugins: [username({ usernameNormalization: false }), identifier()] });
  await signUp(auth, "ada@example.com", "Ada_L");
  await ok(await post(auth, { identifier: "Ada_L", password: PASSWORD }));
  assert.equal((await post(auth, { identifier: "ada_l", password: PASSWORD })).status, 401);
});

test("rate limits the endpoint: 3 requests per 10 seconds by default", async () => {
  const { auth } = setup({ auth: { rateLimit: { enabled: true, storage: "memory" } } });
  await signUp(auth);
  const headers = { "x-forwarded-for": "203.0.113.7" };
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await post(auth, { identifier: "ada_l", password: "wrong-password" }, headers)).status);
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});

test("rate limit is configurable", async () => {
  const { auth } = setup({
    options: { rateLimit: { window: 10, max: 1 } },
    auth: { rateLimit: { enabled: true, storage: "memory" } },
  });
  const headers = { "x-forwarded-for": "203.0.113.8" };
  assert.equal((await post(auth, { identifier: "x", password: "y" }, headers)).status, 401);
  assert.equal((await post(auth, { identifier: "x", password: "y" }, headers)).status, 429);
});

test("fails with EMAIL_PASSWORD_DISABLED when emailAndPassword is off", async () => {
  const { auth } = setup({ auth: { emailAndPassword: { enabled: false } } });
  const res = await post(auth, { identifier: "ada_l", password: PASSWORD });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /EMAIL_PASSWORD_DISABLED/);
});

test("init fails without the username plugin", async () => {
  await assert.rejects(setup({ plugins: [identifier()] }).auth.$context, /`username` plugin is required/);
});

test("init fails with the twoFactor plugin, which would be bypassed", async () => {
  await assert.rejects(setup({ plugins: [username(), twoFactor(), identifier()] }).auth.$context, /twoFactor/);
});

test("the server-side API method signs in too", async () => {
  const { auth } = setup();
  await signUp(auth);
  const res = await auth.api.signInIdentifier({ body: { identifier: "ada_l", password: PASSWORD } });
  assert.equal(res.user.email, "ada@example.com");
});

import assert from "node:assert/strict";
import test from "node:test";
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
import { identifierClient, type IdentifierErrorCode } from "../src/client.js";
import { PASSWORD, setup, signUp } from "./helpers.js";

function clientFor(auth: ReturnType<typeof setup>["auth"]) {
  return createAuthClient({
    baseURL: "http://localhost:3000",
    plugins: [usernameClient(), identifierClient()],
    fetchOptions: { customFetchImpl: (url, init) => auth.handler(new Request(url, init)) },
  });
}

test("authClient.signIn.identifier signs in by username and by email", async () => {
  const { auth } = setup();
  await signUp(auth);
  const client = clientFor(auth);
  const byName = await client.signIn.identifier({ identifier: "ada_l", password: PASSWORD });
  assert.equal(byName.data?.user.email, "ada@example.com");
  const byEmail = await client.signIn.identifier({ identifier: "ada@example.com", password: PASSWORD });
  assert.equal(byEmail.data?.user.email, "ada@example.com");
});

test("client types the body, the result and the error codes", async () => {
  const { auth } = setup();
  const client = clientFor(auth);
  const res = await client.signIn.identifier({ identifier: "nobody", password: "x", rememberMe: false, callbackURL: "/" });
  // @ts-expect-error `identifier` is required
  void client.signIn.identifier({ password: "x" });
  // @ts-expect-error `password` must be a string
  void client.signIn.identifier({ identifier: "a", password: 1 });
  assert.equal(res.error?.status, 401);
  const code: IdentifierErrorCode = "INVALID_EMAIL_OR_PASSWORD";
  assert.equal(res.error?.code, code);
});

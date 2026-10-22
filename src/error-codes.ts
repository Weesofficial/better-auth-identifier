/**
 * Plain data, shared by the server plugin and the client so neither pulls the
 * other's dependencies in. `INVALID_EMAIL_OR_PASSWORD` is the same code and
 * message `/sign-in/email` uses.
 */
export const ERROR_CODES = {
  INVALID_EMAIL_OR_PASSWORD: {
    code: "INVALID_EMAIL_OR_PASSWORD",
    message: "Invalid email or password",
  },
  IDENTIFIER_REQUIRED: {
    code: "IDENTIFIER_REQUIRED",
    message: "Enter your email or username",
  },
  IDENTIFIER_TOO_LONG: {
    code: "IDENTIFIER_TOO_LONG",
    message: "The email or username is too long",
  },
  PASSWORD_TOO_LONG: { code: "PASSWORD_TOO_LONG", message: "Password too long" },
  EMAIL_NOT_VERIFIED: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" },
  EMAIL_PASSWORD_DISABLED: {
    code: "EMAIL_PASSWORD_DISABLED",
    message: "Email and password is not enabled",
  },
  FAILED_TO_CREATE_SESSION: {
    code: "FAILED_TO_CREATE_SESSION",
    message: "Failed to create session",
  },
} as const;

export type IdentifierErrorCode = keyof typeof ERROR_CODES;

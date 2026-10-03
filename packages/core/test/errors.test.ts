import { SinglebaseAuthError, mapErrorToHint } from "../src/errors.js";

describe("SinglebaseAuthError", () => {
  it("uses error.message as the machine-readable code", () => {
    const err = new SinglebaseAuthError({
      type: "UNAUTHORIZED_ERROR",
      status: 401,
      message: "INVALID_CREDENTIALS"
    });
    expect(err.code).toBe("INVALID_CREDENTIALS");
    expect(err.message).toBe("INVALID_CREDENTIALS");
    expect(err.status).toBe(401);
    expect(err.traceId).toBeNull();
  });

  it("carries details and traceId through when present", () => {
    const err = new SinglebaseAuthError({
      type: "VALIDATION_ERROR",
      status: 400,
      message: "INVALID_PAYLOAD",
      details: { field: "email" },
      trace_id: "trace-1"
    });
    expect(err.details).toEqual({ field: "email" });
    expect(err.traceId).toBe("trace-1");
  });

  it("fromNetworkError produces a NETWORK_ERROR code with the original cause", () => {
    const cause = new Error("fetch failed");
    const err = SinglebaseAuthError.fromNetworkError(cause);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.cause).toBe(cause);
  });
});

describe("mapErrorToHint", () => {
  it("maps known codes to their spec-defined hint", () => {
    expect(mapErrorToHint("INVALID_CREDENTIALS")).toBe("generic_credentials_message");
    expect(mapErrorToHint("CODE_REQUIRED")).toBe("reveal_code_input");
    expect(mapErrorToHint("AUTH_RATE_LIMITED")).toBe("disable_retry_show_rate_limited");
  });

  it("maps the OAuth codes", () => {
    expect(mapErrorToHint("OAUTH_SIGNIN_DISABLED")).toBe("remove_oauth_from_signin");
    expect(mapErrorToHint("MISSING_OAUTH_CREDENTIALS")).toBe("show_integrator_config_error");
    expect(mapErrorToHint("OAUTH_VERIFICATION_FAILED")).toBe("restart_oauth");
    expect(mapErrorToHint("PROVIDER_ALREADY_LINKED")).toBe("provider_already_linked");
    expect(mapErrorToHint("VERIFIED_PROVIDER_EMAIL_REQUIRED")).toBe(
      "explain_verified_email_required"
    );
  });

  it("falls back to 'unknown' for an unrecognized code", () => {
    expect(mapErrorToHint("SOMETHING_NEW")).toBe("unknown");
  });
});

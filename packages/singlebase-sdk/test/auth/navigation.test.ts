import { resolveScreen } from "../../src/auth/navigation.js";

describe("resolveScreen", () => {
  it("routes null/null to 'authenticated'", () => {
    expect(resolveScreen({ next_action: null, next_operation: null })).toBe("authenticated");
  });

  it("routes each next_action to its spec-defined screen", () => {
    expect(resolveScreen({ next_action: "SIGNIN", next_operation: "auth.signin" })).toBe("signin");
    expect(resolveScreen({ next_action: "SIGNIN_WITH_CODE", next_operation: "auth.signin" })).toBe(
      "signin_with_code"
    );
    expect(
      resolveScreen({ next_action: "ACCEPT_INVITE_WITH_CODE", next_operation: "auth.signin" })
    ).toBe("accept_invite");
    expect(
      resolveScreen({
        next_action: "RESET_PASSWORD_WITH_CODE",
        next_operation: "auth.confirm_code"
      })
    ).toBe("reset_password_confirm");
    expect(
      resolveScreen({ next_action: "CHANGE_EMAIL_WITH_CODE", next_operation: "auth.confirm_code" })
    ).toBe("change_email_confirm");
    expect(
      resolveScreen({
        next_action: "CHANGE_USERNAME_WITH_CODE",
        next_operation: "auth.confirm_code"
      })
    ).toBe("change_username_confirm");
  });
});

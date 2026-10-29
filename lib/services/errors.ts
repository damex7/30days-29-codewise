// Errors services throw. Actions and route handlers turn them into
// responses, so the rules live in one place and the transport stays thin.

/**
 * Someone else's record looks exactly like a record that doesn't exist.
 * A 403 ("forbidden") would confirm that the id is real and belongs to
 * someone, which leaks information and invites guessing. 404 says nothing.
 */
export class NotFoundError extends Error {
  override name = "NotFoundError";
  constructor(message = "Not found") {
    super(message);
  }
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
  constructor(message = "You can't do that") {
    super(message);
  }
}

export class LimitError extends Error {
  override name = "LimitError";
  readonly retryAfter: number;
  readonly kind: "per_minute" | "daily" | "signin" | "demo";
  constructor(kind: LimitError["kind"], retryAfter: number, message: string) {
    super(message);
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

export class InputError extends Error {
  override name = "InputError";
}

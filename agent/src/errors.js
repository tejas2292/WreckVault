// Errors carry the process exit code from spec §8.5:
// 0 ok, 1 error, 2 ambiguous/not found, 3 not logged in, 4 server unreachable and no cache.
export const EXIT = Object.freeze({ OK: 0, ERROR: 1, NOT_FOUND: 2, NOT_LOGGED_IN: 3, UNREACHABLE: 4 });

export class WvError extends Error {
  constructor(message, exitCode = EXIT.ERROR, extra = {}) {
    super(message);
    this.name = 'WvError';
    this.exitCode = exitCode;
    Object.assign(this, extra);
  }
}

// The server could not be reached (DNS, refused, timeout).
export class NetworkError extends WvError {
  constructor(message) {
    super(message, EXIT.UNREACHABLE);
    this.name = 'NetworkError';
  }
}

// The server answered with a non-2xx status.
export class ApiError extends WvError {
  constructor(status, message) {
    super(message, EXIT.ERROR, { status });
    this.name = 'ApiError';
  }
}

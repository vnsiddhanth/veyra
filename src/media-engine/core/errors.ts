export type MediaErrorCode =
  | 'cancelled'
  | 'unsupported-container'
  | 'unsupported-codec'
  | 'corrupt'
  | 'no-tracks'
  | 'not-media'
  | 'worker-crashed'
  | 'out-of-memory'
  | 'unknown';

/** Typed engine error with a user-presentable message. */
export class MediaError extends Error {
  readonly code: MediaErrorCode;
  readonly detail?: string;

  constructor(code: MediaErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    this.detail = detail;
  }

  toJSON(): SerializedMediaError {
    return { code: this.code, message: this.message, detail: this.detail };
  }

  static from(value: unknown): MediaError {
    if (value instanceof MediaError) return value;
    if (isSerialized(value)) return new MediaError(value.code, value.message, value.detail);
    const message = value instanceof Error ? value.message : String(value);
    return new MediaError('unknown', 'Something went wrong while processing this file.', message);
  }
}

export interface SerializedMediaError {
  code: MediaErrorCode;
  message: string;
  detail?: string;
}

function isSerialized(v: unknown): v is SerializedMediaError {
  return typeof v === 'object' && v !== null && 'code' in v && 'message' in v;
}

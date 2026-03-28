import { H3Event, setResponseStatus } from "h3";

export type ApiErrorEnvelope = {
  error: {
    status: number;
    message: string;
    details?: unknown;
  };
};

export function createApiError(
  status: number,
  message: string,
  details?: unknown
): ApiErrorEnvelope {
  return {
    error: {
      status,
      message,
      ...(details === undefined ? {} : { details })
    }
  };
}

export function sendApiError(
  event: H3Event,
  status: number,
  message: string,
  details?: unknown
): ApiErrorEnvelope {
  setResponseStatus(event, status);
  return createApiError(status, message, details);
}

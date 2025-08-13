/**
 * hardcoded average gzip compression rate for JSON-RPC responses, used when
 * estimating bandwidth usage.
 */
export const AVG_GZIP_COMPRESSION = 0.925;

/**
 * hardcoded rough average for HTTP header size on HTTP requests
 */
export const AVG_HTTP_REQUEST_HEADER_SIZE = 600;

/**
 * hardcoded rough average for HTTP header size on HTTP responses
 */
export const AVG_HTTP_RESPONSE_HEADER_SIZE = 300;

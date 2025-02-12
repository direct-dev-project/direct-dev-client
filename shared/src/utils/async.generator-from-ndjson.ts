import { isRecord } from "../guards.js";

/**
 * utility that'll stream the response from a fetch request, and yield the
 * individual NDJSON payloads as parsed objects
 */
export async function* makeGeneratorWithReturnFromNDJsonResponse<TYield, TReturn>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<TYield, TReturn> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value !== undefined) {
      buffer += value;

      // iterate over all complete payloads by splitting the response when
      // hitting newlines, and the parse and yield each one
      let delimeterIndex: number;
      while ((delimeterIndex = buffer.indexOf("\n")) !== -1) {
        const result = assertIteratorResult(JSON.parse(buffer.substring(0, delimeterIndex)));

        if (result.done) {
          return result.value as TReturn;
        } else {
          yield result.value as TYield;
        }

        // remove the payload that we just yielded from the buffer, so it's
        // not yielded again
        buffer = buffer.substring(delimeterIndex + 1);
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer) {
    // yield the final payload, if it wasn't wrapped with a newline
    const result = assertIteratorResult(JSON.parse(buffer));

    if (result.done) {
      return result.value as TReturn;
    } else {
      yield result.value as TYield;
    }
  }

  return {} as TReturn;
}

/**
 * very simple validator to ensure correctness of iterator result values as
 * received from the remote.
 */
function assertIteratorResult(input: unknown): {
  done?: boolean;
  value: unknown;
} {
  if (!isRecord(input)) {
    throw new Error("assertIteratorResult: input must be of type record");
  }

  if ("done" in input && typeof input["done"] !== "boolean") {
    throw new Error("assertIteratorResult: typeof done is invalid, must be 'boolean'");
  }

  if (!("value" in input)) {
    throw new Error("assertIteratorResult: value property missing");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return input as any;
}

/**
 * utility that'll stream the response from a fetch request, and yield the
 * individual NDJSON payloads as parsed objects
 */
export async function* makeGeneratorFromNDJsonResponse<TYield, TReturn>(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<TYield, TReturn> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value !== undefined) {
      buffer += value;

      // iterate over all complete payloads by splitting the response when
      // hitting newlines, and the parse and yield each one
      let delimeterIndex: number;
      while ((delimeterIndex = buffer.indexOf("\n")) !== -1) {
        yield JSON.parse(buffer.substring(0, delimeterIndex));

        // remove the payload that we just yielded from the buffer, so it's
        // not yielded again
        buffer = buffer.substring(delimeterIndex + 1);
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer) {
    // yield the final payload, if it wasn't wrapped with a newline
    yield JSON.parse(buffer);
  }

  return {} as TReturn;
}

/**
 * utility that'll transform a ReadableStream of ND-JSON based content into a
 * generator
 */
export async function* makeGeneratorFromNDJson<T>(
  stream: ReadableStream<Uint8Array>,
  maxSizeInBytes?: number,
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";
  let readBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (value !== undefined) {
      readBytes += value.length;

      if (maxSizeInBytes != null && readBytes > maxSizeInBytes) {
        // if stream input has exceeded maximum size, then stop reading more
        // data
        throw NDJSON_MAX_SIZE_ERR;
      }

      buffer += decoder.decode(value);

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
}

export const NDJSON_MAX_SIZE_ERR = new Error("makeGeneratorFromNDJson: maximum stream size has been exceeded");

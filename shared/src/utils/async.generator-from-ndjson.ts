/**
 * utility that'll transform a ReadableStream of ND-JSON based content into a
 * generator
 */
export async function* makeGeneratorFromNDJson<T>(stream: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value !== undefined) {
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

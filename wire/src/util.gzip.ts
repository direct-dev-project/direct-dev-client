/**
 * internal helper to perform compression of a byte array, allowing compression
 * on upstream content where it makes sense.
 */
export async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");

  // send the raw input through the compression writer
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();

  // read the compressed output into chunks of output data
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  // combine output into a single Uint8Array that can be pushed onto a
  // WireEncodeStream
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * internal helper to perform decompression of a byte array, allowing us to
 * quickly decompress data when reading data in WireDecodeStream
 */
export async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  const cs = new DecompressionStream("gzip");

  // send the raw input through the compression writer
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();

  // read the compressed output into chunks of output data
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  // combine output into a single Uint8Array that can be further proccessed
  // within a WireDecodeStream
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

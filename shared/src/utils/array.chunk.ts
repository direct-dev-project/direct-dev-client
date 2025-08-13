/**
 * very basic implementation of an array chunker, which splits an array into a
 * set of chunks with a defined maximum size for each chunk
 */
export function chunkArray<T>(input: T[], maxBatchSize: number): T[][] {
  const chunks: [T[], ...T[][]] = [[]];

  for (const item of input) {
    if (chunks[0].length >= maxBatchSize) {
      chunks.unshift([]);
    }

    chunks[0].push(item);
  }

  return chunks.filter((chunk) => chunk.length > 0).reverse();
}

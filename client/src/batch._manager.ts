import { makeDeferred, PushableAsyncGenerator, type Deferred, type Logger } from "@direct.dev/shared";

import type { BatchConfig, BatchRequest, DirectRPCBatch } from "./batch.core.js";
import { DirectRPCDuplexFetchBatch } from "./batch.duplex-fetch.js";
import { DirectRPCFetchBatch } from "./batch.fetch.js";

/**
 * configures the maximum number of requests handled within a single batch
 */
const MAX_BATCH_REQUESTS = 25;

/**
 * configures the maximum payload size of a single batch, so that we never
 * overload Direct.dev infrastructure
 */
const MAX_BATCH_BYTE_LENGTH = 500_000;

/**
 * over-arching manager for RPC batches, allowing automatic splitting of large
 * batches to allow infinitely scaling payload sizes to be handled gracefully
 * while still retaining block height consistency guarantees.
 */
export class DirectRPCBatchManager {
  readonly #config: Omit<BatchConfig, "blockHeight">;
  readonly #params: Pick<BatchConfig, "blockHeight">;
  readonly #logger: Logger;

  /**
   * collection of all batches created, so responses can be merged externally.
   */
  readonly #batches: DirectRPCBatch[] = [];

  /**
   * reference to the currently open batch
   */
  #currentBatch: DirectRPCBatch;

  /**
   * in-memory copy of the block height this isntance is tied to; either read
   * from initial configuration or the head from the first dispatch batched.
   */
  #upstreamBlockHeight: Deferred<RPCBlockHeight | undefined> | undefined;

  /**
   * internal output stream used to merge outputs across multiple batches.
   */
  readonly #outputStream = new PushableAsyncGenerator<
    | { type: "head"; value: DirectRPCHead }
    | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse }
    | { type: "tail"; value: { upload: number; download: number } }
  >();

  /**
   * collection of promises that resolve once batch streams have opened,
   * indicating whether the result was a success or a failure.
   */
  readonly #openPromises: Array<Promise<void>> = [];

  /**
   * collection of promises that will resolve once a batch stream has finished
   * yielding all stream segments, so we can defer closing the merged stream
   * until all data has been fully received
   */
  readonly #outputPromises: Array<Promise<void>> = [];

  constructor(logger: Logger, config: Omit<BatchConfig, "blockHeight">, params: Pick<BatchConfig, "blockHeight">) {
    this.#logger = logger;
    this.#config = config;
    this.#params = params;

    // create initial batch
    this.#currentBatch = this.#makeBatch();
    this.#batches.push(this.#currentBatch);
  }

  /**
   * get the combined number of requests pushed across all batches.
   */
  get length() {
    return this.#batches.reduce((acc, batch) => acc + batch.length, 0);
  }

  /**
   * utility to get the combined list of requests pushed across all batches.
   */
  get requests() {
    return this.#batches.map((it) => it.requests).flatMap((it) => it);
  }

  /**
   * internal helper to create a new batch instance, allowing us to handle the
   * automatic splitting
   */
  #makeBatch(): DirectRPCBatch {
    const batchConfig = {
      ...this.#config,
      ...this.#params,
      blockHeight: this.#params.blockHeight ?? this.#upstreamBlockHeight,
    };

    return supportsFetchDuplex.current === true && batchConfig.isHttps
      ? new DirectRPCDuplexFetchBatch(batchConfig, this.#logger)
      : new DirectRPCFetchBatch(batchConfig, this.#logger);
  }

  /**
   * push a request onto this batching instance, automatically splitting the
   * into multiple HTTP batches if configured size limits are exceeded.
   */
  push(req: BatchRequest): void {
    if (this.#currentBatch.length >= MAX_BATCH_REQUESTS || this.#currentBatch.sizeInBytes >= MAX_BATCH_BYTE_LENGTH) {
      // dispatch the current batch, as it is now being superseeded by the next
      // batch in line
      this.#dispatchCurrentBatch();

      this.#currentBatch = this.#makeBatch();
      this.#batches.push(this.#currentBatch);
    }

    this.#currentBatch.push({
      requestKey: req.requestKey,
      requestBody: {
        ...req.requestBody,

        // re-map ids of requests, so that they're equal to the index of the
        // request in the batch list (this is useful when receiving responses as
        // it allows us to quickly identify the associated request hash and
        // resolve the correct inflight promise)
        id: this.length + 1,
      },
    });
  }

  /**
   * dispatch the current batch and merge responses onto the final outcome
   */
  #dispatchCurrentBatch() {
    this.#upstreamBlockHeight ??= makeDeferred();

    const batchPromise = this.#currentBatch.dispatch();

    // create a promise which resolves once the batch stream has been
    // successfully opened
    this.#openPromises.push(
      batchPromise.then((stream) => {
        if (!stream) {
          throw new Error("DirectRPCBatchManager.#dispatchCurrentBatch(): failed to deliver response stream");
        }
      }),
    );

    // create a promise which resolves once the batch stream has been fully
    // closed
    this.#outputPromises.push(
      batchPromise.then(async (stream) => {
        if (!stream) {
          return;
        }

        for await (const segment of stream) {
          switch (segment.type) {
            case "head":
              if (!this.#upstreamBlockHeight?.__isFulfilled()) {
                this.#outputStream.push(segment);
                this.#upstreamBlockHeight?.__resolve(segment.value.blockHeight ?? undefined);
              }
              break;

            default:
              this.#outputStream.push(segment);
          }
        }
      }),
    );
  }

  /**
   * dispatch the final pending batch, and return the merged output stream to
   * caller.
   */
  async dispatch(): Promise<
    | AsyncGenerator<
        | { type: "head"; value: DirectRPCHead }
        | { type: "item"; value: DirectRPCResultResponse | DirectRPCErrorResponse }
        | { type: "tail"; value: { upload: number; download: number } }
      >
    | undefined
  > {
    try {
      if (this.#currentBatch.length > 0) {
        this.#dispatchCurrentBatch();
      }

      const batchResults = await Promise.allSettled(this.#openPromises);

      if (batchResults.some((it) => it.status === "rejected")) {
        // if any of the sub-batches failed to deliver response, then bail out
        // as we can no longer guarantee correctness of response
        return;
      }

      Promise.all(this.#outputPromises).then(
        () => {
          this.#outputStream.close(null);
        },
        (err) => {
          this.#outputStream.throw(err);
        },
      );

      return this.#outputStream;
    } catch (err) {
      this.#logger.error("DirectRPCBatchManager", "an unknown error occurred when dispatching", { err });

      Promise.allSettled(this.#outputPromises).then(() => {
        this.#outputStream.close(null);
      });
    }
  }
}

/**
 * feature checker, to review if the browser supports using `duplex: half`
 */
const supportsFetchDuplex = {
  current: false,
};

(async () => {
  try {
    const req = new Request("", {
      method: "POST",
      body: new ReadableStream(),

      // @ts-expect-error: duplex is not yet included in TypeScript
      // definitions for Response
      duplex: "half",
    });

    // @ts-expect-error: duplex is not yet included in TypeScript
    // definitions for Response
    if (req.duplex !== "half") {
      return false;
    }

    // mock a fetch request with duplex: half to ensure that the browser
    // actually supports streaming and no browser extensions will interrupt
    // support (as is the case with e.g. Requestly)
    return fetch("data:a/a;charset=utf-8,", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue("duplex");
          controller.close();
        },
      }),

      // @ts-expect-error: duplex is not yet included in TypeScript
      // definitions for Response
      duplex: "half",
    }).then(
      () => true,
      () => false,
    );
  } catch {
    return false;
  }
})().then((result) => {
  supportsFetchDuplex.current = result;
});

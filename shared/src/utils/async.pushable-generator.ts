import type { Deferred } from "./async.deferred.js";
import { makeDeferred } from "./async.deferred.js";

/**
 * creates an AsyncGenerator interface, to which values can easily be pushed
 * during runtime - similar to streaming, but without having to encode/decode
 * values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class PushableAsyncGenerator<T, TReturn = any> implements AsyncGenerator<T, TReturn> {
  /**
   * keeps track of whether the generator has been closed, in which case we
   * disallow pushing further entries onto it.
   */
  #isClosed = false;

  /**
   * internal collection of promises, which are resolved when content is being
   * pushed into the generator
   */
  #deferred: Array<Deferred<IteratorResult<T, TReturn>>> = [];

  /**
   * collection of callbacks subscribed to items being pushed onto this
   * generator in real time.
   */
  #taps = new Set<(value: T) => void>();

  /**
   * cursor pointing to the next promise that should be read while iterating
   * through the stream
   */
  #readCursor = 0;

  /**
   * cursor pointing to the next promise that should be resolved, when pushing
   * entries or closing the generator
   */
  #writeCursor = 0;

  constructor(cb?: (push: (value: T) => void) => Promise<TReturn>) {
    if (cb) {
      cb((value) => this.push(value)).then((value) => this.close(value));
    }
  }

  /**
   * subscribe a callback to values being pushed onto this iterator, without
   * modifying the stream of events.
   */
  tap(cb: (value: T) => void) {
    this.#taps.add(cb);
  }

  /**
   * pushes a new value onto the generator at runtime
   */
  push(value: T) {
    if (this.#isClosed) {
      throw new Error("PushableAsyncGenerator.push(): Generator is already closed");
    }

    (this.#deferred[this.#writeCursor++] ??= makeDeferred()).__resolve({ done: false, value });
    this.#taps.forEach((cb) => cb(value));
  }

  /**
   * closes the generator, allowing iterators to stop looping after receiving
   * this value.
   */
  async close(value: TReturn) {
    if (this.#isClosed) {
      throw new Error("PushableAsyncGenerator.close(): Generator is already closed");
    }

    this.#isClosed = true;
    (this.#deferred[this.#writeCursor++] ??= makeDeferred()).__resolve({ done: true, value });
  }

  /**
   * tiny helper that transforms the generator into an array.
   */
  async toArray(maxLength?: number): Promise<T[]> {
    const output: T[] = [];

    for (let i = 0, j = maxLength ?? Infinity; i < j; i++) {
      const nextResult = await (this.#deferred[i] ??= makeDeferred());

      if (nextResult.done) {
        // we cannot iterate further than the length of the stream, break loop
        // if generator ends
        break;
      }

      output.push(nextResult.value);
    }

    return output;
  }

  /**
   * reads the current size of the generator, if it was transformed to an array.
   */
  get size(): number {
    return this.#isClosed ? this.#writeCursor - 1 : this.#writeCursor;
  }

  /**
   * specifies if the generator has been closed yet
   */
  get isClosed() {
    return this.#isClosed;
  }

  //
  // implementatino of the AsyncGenerator spec
  //

  async next() {
    if (this.#readCursor >= this.#writeCursor && this.#isClosed) {
      return (await this.#deferred[this.#writeCursor - 1]) as IteratorReturnResult<TReturn>;
    }

    return (this.#deferred[this.#readCursor++] ??= makeDeferred());
  }

  async return(value: TReturn) {
    if (this.#isClosed) {
      throw new Error("PushableAsyncGenerator.return(): Generator is already closed");
    }

    this.#isClosed = true;

    return (this.#deferred[this.#writeCursor++] ??= makeDeferred()).__resolve({ done: true, value });
  }

  async throw(reason: unknown) {
    if (this.#isClosed) {
      throw new Error("PushableAsyncGenerator.throw(): Generator is already closed");
    }

    this.#isClosed = true;

    return (this.#deferred[this.#writeCursor++] ??= makeDeferred()).__reject(reason);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async [Symbol.asyncDispose]() {
    this.#deferred = [];
  }
}

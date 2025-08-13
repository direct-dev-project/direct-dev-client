/**
 * a collection of a few communly used types, that make code simpler to read
 * and understnd
 */

//
// promises
//
type MaybePromise<T> = Promise<UnwrapPromise<T>> | UnwrapPromise<T>;
type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

//
// arrays
//
type MaybeArray<T> = T | T[];

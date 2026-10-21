/** Minimal jQuery surface so Morebits JSDoc can resolve. */
interface JQuery {
  find(selector: string): JQuery;
  empty(): JQuery;
  append(...args: unknown[]): JQuery;
  attr(name: string, value: unknown): JQuery;
  prop(name: string, value: unknown): JQuery;
  on(event: string, handler: (...args: unknown[]) => void): JQuery;
  get(): unknown[];
}

interface JQueryStatic {
  (selector?: unknown, context?: unknown): JQuery;
  ajax(settings?: unknown): JQuery.Promise<unknown>;
}

declare namespace JQuery {
  interface Promise<T> extends PromiseLike<T> {
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): JQuery.Promise<TResult1 | TResult2>;
  }
}

declare const $: JQueryStatic;
declare const jQuery: JQueryStatic;

interface Window {
  $: JQueryStatic;
  jQuery: JQueryStatic;
}

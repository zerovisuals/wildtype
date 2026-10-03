export type Options = {
  /** Use your own emoji pool instead of the context engine. */
  emojis?: string[];
};
/** Letters turn into emojis under the pointer. Returns a cleanup function. */
export function hover(el: HTMLElement, opts?: Options): () => void;
/** Small emojis sprout on top of the letters and sway. Returns a cleanup function. */
export function garden(el: HTMLElement, opts?: Options & { density?: number }): () => void;

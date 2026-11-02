import { useCallback, useMemo, useRef } from "react";

/**
 * Stable React keys for a list whose rows are edited and deleted by index.
 *
 * The index cannot double as the row's identity: deleting one shifts every row
 * below it up a slot, and React — along with anything else keyed by index, like
 * "which row is expanded" — follows the slot instead of the row. The visible
 * result is a caret jumping into the wrong field, or the wrong row unfolding.
 *
 * The row's own data is no better a key here: these editors let you type the
 * very field that identifies the row, and keying on it would remount the input
 * mid-keystroke.
 *
 * So each row gets a number when it appears, and `remove` takes it away with
 * the row. A list replaced wholesale (a reload, a revert) is re-keyed by the
 * length check, which is the one case where remounting is the honest answer.
 */
export function useRowKeys(length: number) {
  const next = useRef(0);
  const keys = useRef<number[]>([]);

  if (keys.current.length !== length) {
    const grown = keys.current.slice(0, length);
    while (grown.length < length) grown.push(next.current++);
    keys.current = grown;
  }

  const keyAt = useCallback((index: number) => keys.current[index] ?? -index - 1, []);

  /** Call alongside the state update that appends a row. */
  const add = useCallback(() => {
    keys.current = [...keys.current, next.current++];
  }, []);

  /** Call alongside the state update that removes row `index`. */
  const remove = useCallback((index: number) => {
    keys.current = keys.current.filter((_, i) => i !== index);
  }, []);

  /** Call alongside the state update that moves row `from` to index `to`. */
  const move = useCallback((from: number, to: number) => {
    const next = [...keys.current];
    const [k] = next.splice(from, 1);
    next.splice(to, 0, k);
    keys.current = next;
  }, []);

  /** Call when the whole list is replaced and every row is a new row. */
  const reset = useCallback((count: number) => {
    keys.current = Array.from({ length: count }, () => next.current++);
  }, []);

  // One stable object, so callers can list it in a dependency array without
  // rebuilding every callback that touches a row.
  return useMemo(
    () => ({ keyAt, add, remove, move, reset }),
    [keyAt, add, remove, move, reset],
  );
}

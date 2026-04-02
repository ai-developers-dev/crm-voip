/* eslint-disable @typescript-eslint/no-unused-vars, import/no-anonymous-default-export */
import { useSyncExternalStore } from "react";

function useSyncExternalStoreWithSelector(
  subscribe,
  getSnapshot,
  getServerSnapshot,
  selector,
  isEqual
) {
  const selectedSnapshot = useSyncExternalStore(
    subscribe,
    () => selector(getSnapshot()),
    getServerSnapshot ? () => selector(getServerSnapshot()) : undefined
  );
  return selectedSnapshot;
}

export { useSyncExternalStoreWithSelector };
export default { useSyncExternalStoreWithSelector };

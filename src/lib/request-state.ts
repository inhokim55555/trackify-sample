export interface RequestState<T> {
  requestUrl: string | null;
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

/** Effects run after rendering: never expose the previous request's data in that gap. */
export function currentRequestState<T>(state: RequestState<T>, url: string | null): RequestState<T> {
  return state.requestUrl === url ? state : {
    requestUrl: url,
    data: null,
    error: null,
    loading: Boolean(url),
    refreshing: false,
  };
}

export function canEditRequest(
  recordsUrl: string | null,
  currentUrl: string | null,
  state: Pick<RequestState<unknown>, "requestUrl" | "data" | "loading" | "error">
) {
  return Boolean(currentUrl) && recordsUrl === currentUrl && state.requestUrl === currentUrl && Boolean(state.data) && !state.loading && !state.error;
}

/** Cancellation happens immediately on reload, before React runs the next effect. */
export class RequestGate {
  private active: AbortController | null = null;

  begin() {
    this.cancel();
    this.active = new AbortController();
    return this.active;
  }

  isCurrent(controller: AbortController) {
    return this.active === controller && !controller.signal.aborted;
  }

  cancel(controller?: AbortController) {
    if (controller && this.active !== controller) return;
    this.active?.abort();
    this.active = null;
  }
}

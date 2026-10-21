/** Coalesce synchronous storage writes, but flush before navigation or refresh. */
export class DraftWriter {
  private pending: { key: string; value: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private storage: Pick<Storage, "setItem" | "removeItem">,
    private onSaved: () => void,
    private onError: () => void,
    private delay = 250,
  ) {}
  schedule(key: string, value: string) {
    if (this.pending && this.pending.key !== key) this.flush();
    this.pending = { key, value };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delay);
  }
  flush() {
    clearTimeout(this.timer);
    const pending = this.pending;
    if (!pending) return true;
    try {
      this.storage.setItem(pending.key, pending.value);
      this.pending = null;
      this.onSaved();
      return true;
    } catch {
      this.onError();
      return false;
    }
  }
  writeNow(key: string, value: string) {
    this.schedule(key, value);
    return this.flush();
  }
  clear(key: string) {
    if (this.pending?.key === key) {
      clearTimeout(this.timer);
      this.pending = null;
    }
    try {
      this.storage.removeItem(key);
    } catch {
      this.onError();
    }
  }
}

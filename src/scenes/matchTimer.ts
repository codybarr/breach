/** Screen-local elapsed time; independent of the animation delta clamp. */
export class MatchTimer {
  private started: number;
  private stopped: number | null = null;

  constructor(private now = () => performance.now()) {
    this.started = now();
  }

  read(over: boolean): string {
    if (over && this.stopped === null) this.stopped = this.now();
    const seconds = Math.max(0, Math.floor(((this.stopped ?? this.now()) - this.started) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
}

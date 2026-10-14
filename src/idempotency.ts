/**
 * Runs an operation at most once per key: a repeated call with the same key gets the first call's
 * result, including while that call is still in flight. A call that fails is forgotten, so the
 * client can retry it with the same key.
 *
 * Kept in memory, like everything else in this service.
 */
export class Idempotency<T> {
  private readonly results = new Map<string, Promise<T>>()

  run(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.results.get(key)
    if (existing) return existing

    const result = operation()
    this.results.set(key, result)
    result.catch(() => {
      if (this.results.get(key) === result) this.results.delete(key)
    })
    return result
  }
}

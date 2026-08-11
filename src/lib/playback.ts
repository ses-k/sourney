export function isPlayInterruptedError(error: unknown): boolean {
  if (!error) return false

  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      /The play\(\) request was interrupted/i.test(error.message) ||
      /interrupted by a call to pause/i.test(error.message)
    )
  }

  return false
}

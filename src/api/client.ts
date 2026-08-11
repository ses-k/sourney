export function getApi() {
  if (!window.sourney) {
    throw new Error(
      'Sourney API is unavailable. Open the app through Electron (npm run dev), not a regular browser tab.',
    )
  }
  return window.sourney
}

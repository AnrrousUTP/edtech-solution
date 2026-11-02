/** Emite eventos JSON estructurados a stderr para que los recoja el runtime. */
export const logError = (event: Record<string, unknown>): void => {
  process.stderr.write(`${JSON.stringify(event)}\n`)
}

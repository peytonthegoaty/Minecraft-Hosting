/** Splits streamed text into whole lines. */
export function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let carry = ''
  return (chunk: string) => {
    const parts = (carry + chunk).split(/\r?\n/)
    carry = parts.pop() ?? ''
    for (const p of parts) if (p.length) onLine(p)
    if (carry.length > 16384) {
      onLine(carry)
      carry = ''
    }
  }
}

const encoder = new TextEncoder()

export function constantTimeEqual(actual: string | null, expected: string): boolean {
  if (!actual || !expected) return false

  const actualBytes = encoder.encode(actual)
  const expectedBytes = encoder.encode(expected)
  if (actualBytes.length !== expectedBytes.length) return false

  let difference = 0
  for (let index = 0; index < actualBytes.length; index++) {
    difference |= actualBytes[index] ^ expectedBytes[index]
  }

  return difference === 0
}

export function isBearerAuthorized(header: string | null, expectedToken: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  return constantTimeEqual(header.slice('Bearer '.length), expectedToken)
}

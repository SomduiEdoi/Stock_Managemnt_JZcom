export function isDatabaseUnavailableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("can't reach database server") ||
    message.includes("connection refused") ||
    message.includes("econnrefused") ||
    message.includes("timed out fetching a new connection")
  );
}

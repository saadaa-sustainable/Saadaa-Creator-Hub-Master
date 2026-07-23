export function isCronAuthorized(
  req: { headers: Headers },
  secret = process.env.CRON_SECRET?.trim(),
): boolean {
  return Boolean(
    secret && req.headers.get("authorization") === `Bearer ${secret}`,
  );
}

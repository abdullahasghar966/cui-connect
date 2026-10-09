/** The connection string with its password hidden, safe to print in logs. */
export function maskMongoUri(uri: string): string {
  return uri.replace(/\/\/([^:/@]+):[^@]*@/, '//$1:****@');
}

/**
 * Turns a MongoDB connection failure into a sentence someone deploying the app can act on
 * (the raw driver errors are cryptic: `querySrv ENOTFOUND`, `bad auth`, server selection...).
 */
export function explainMongoError(err: unknown): string {
  const text = `${(err as { code?: string }).code ?? ''} ${(err as Error).message ?? err}`;
  if (/ENOTFOUND|querySrv|EBADNAME|Invalid scheme|URI must include/i.test(text)) {
    return 'The cluster address in MONGODB_URI is wrong or incomplete. Copy the whole link again from Atlas → Clusters → Connect → Drivers.';
  }
  if (/bad auth|authentication failed|auth.*fail/i.test(text)) {
    return "Atlas rejected the username or password in MONGODB_URI. Replace <db_password> (including the < >) with the database user's password, or reset that password under Database & Network Access → Database Users.";
  }
  if (
    /whitelist|IP.*access|ServerSelection|ReplicaSetNoPrimary|timed out|ETIMEDOUT|ECONNREFUSED/i.test(
      text,
    )
  ) {
    return 'Atlas did not accept the connection. Under Database & Network Access → IP Access List, add 0.0.0.0/0 (Allow access from anywhere) and wait until it shows Active, then redeploy.';
  }
  return 'Could not connect to MongoDB. Check MONGODB_URI.';
}

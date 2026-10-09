import { describe, expect, it } from 'vitest';
import { explainMongoError, maskMongoUri } from '../src/db/explain';

describe('MongoDB startup errors', () => {
  it('hides the password when printing the connection string', () => {
    expect(maskMongoUri('mongodb+srv://cuiconnect:S3cret@cluster0.ab1cd.mongodb.net/?x=1')).toBe(
      'mongodb+srv://cuiconnect:****@cluster0.ab1cd.mongodb.net/?x=1',
    );
    expect(maskMongoUri('mongodb://127.0.0.1:27019')).toBe('mongodb://127.0.0.1:27019');
  });

  it('explains the common Atlas mistakes in plain words', () => {
    const dns = Object.assign(new Error('querySrv ENOTFOUND _mongodb._tcp.cluster0.x.net'), {
      code: 'ENOTFOUND',
    });
    expect(explainMongoError(dns)).toMatch(/cluster address/);
    expect(explainMongoError(new Error('bad auth : authentication failed'))).toMatch(
      /username or password/,
    );
    const blocked = Object.assign(new Error('Could not connect to any servers'), {
      name: 'MongooseServerSelectionError',
      code: 'ServerSelection',
    });
    expect(explainMongoError(blocked)).toMatch(/IP Access List/);
  });
});

import { describe, expect, it } from 'vitest';
import { feedbackSubject } from '../src/shared/feedback';
import { partitionAdapter } from '../src/partition-adapter';

describe('registered feedback subject boundary', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'rejects inherited object property %s as an unregistered subject kind', kind => {
      expect(() => feedbackSubject(partitionAdapter, kind, 'partition'))
        .toThrow(expect.objectContaining({ status: 404 }));
    },
  );
  it('continues to resolve the explicitly registered game subject', () => {
    expect(feedbackSubject(partitionAdapter, 'game', 'partition'))
      .toEqual({ kind: 'game', id: 'partition' });
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { detectImage, parseAmount, validateDepositFields } from './validate.ts';

test('parseAmount', () => {
  assert.equal(parseAmount('1,000'), '1000.00');
  assert.equal(parseAmount('12.5'), '12.50');
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount('abc'), null);
});

test('detectImage trusts bytes, not names', () => {
  assert.equal(detectImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))?.ext, 'jpg');
  assert.equal(detectImage(new TextEncoder().encode('<?php echo 1; ?> padding padding')), null);
  assert.equal(detectImage(new TextEncoder().encode('%PDF-1.7 padding padding')), null);
});

test('validateDepositFields', () => {
  const good = { patientName: 'ก', amount: '100', transferAt: new Date(Date.now() - 3600_000).toISOString(), payerName: 'ข' };
  assert.equal(validateDepositFields(good).ok, true);
  assert.equal(validateDepositFields({ ...good, amount: '0' }).ok, false);
  assert.equal(validateDepositFields({ ...good, transferAt: new Date(Date.now() + 86400_000).toISOString() }).ok, false);
});

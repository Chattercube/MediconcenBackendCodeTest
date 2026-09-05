import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { ResolveUserDto } from '../src/user-links/dto/resolve-user.dto';
import { createValidationPipe } from '../src/validation';

function validate(body: unknown): Promise<ResolveUserDto> {
  return createValidationPipe().transform(body, {
    type: 'body',
    metatype: ResolveUserDto,
  });
}

test('accepts a valid identifier pair and transforms it into the DTO', async () => {
  const result = await validate({ id1: 'ABC123', id2: 'XYZ456' });

  assert.ok(result instanceof ResolveUserDto);
  assert.equal(result.id1, 'ABC123');
  assert.equal(result.id2, 'XYZ456');
});

test('accepts identifiers at the length boundaries without modifying them', async () => {
  const result = await validate({ id1: 'a', id2: 'b'.repeat(255) });

  assert.equal(result.id1, 'a');
  assert.equal(result.id2, 'b'.repeat(255));
});

const invalidValues: { label: string; value: unknown }[] = [
  { label: 'missing', value: undefined },
  { label: 'null', value: null },
  { label: 'empty', value: '' },
  { label: 'numeric', value: 123 },
  { label: 'boolean', value: true },
  { label: 'an array', value: ['ABC123'] },
  { label: 'an object', value: { value: 'ABC123' } },
  { label: 'longer than 255 characters', value: 'a'.repeat(256) },
];

for (const field of ['id1', 'id2'] as const) {
  for (const { label, value } of invalidValues) {
    test(`rejects ${field} when ${label} with a field-specific 400 error`, async () => {
      const body: Record<string, unknown> = { id1: 'ABC123', id2: 'XYZ456' };
      if (value === undefined) {
        delete body[field];
      } else {
        body[field] = value;
      }

      await assert.rejects(validate(body), (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.equal(error.getStatus(), 400);
        const response = error.getResponse() as { message: string[] };
        assert.ok(Array.isArray(response.message));
        assert.ok(response.message.some((message) => message.includes(field)));
        return true;
      });
    });
  }
}

test('rejects unexpected properties instead of silently discarding them', async () => {
  await assert.rejects(
    validate({ id1: 'ABC123', id2: 'XYZ456', admin: true }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.getStatus(), 400);
      const response = error.getResponse() as { message: string[] };
      assert.ok(response.message.some((message) => message.includes('admin')));
      return true;
    },
  );
});

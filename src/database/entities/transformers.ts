import type { ValueTransformer } from 'typeorm';

/** `numeric` chega do Postgres como string. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

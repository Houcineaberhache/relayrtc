import type { z } from "zod";

import { ApiError } from "../errors/api-error.js";

export const validate = <Output>(schema: z.ZodType<Output>, value: unknown): Output => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "The request did not match the required API contract",
    );
  }

  return result.data;
};

// Node defines it, and browser bundlers replace `process.env.NODE_ENV` (see errors.gen.ts).
declare var process: { env: { NODE_ENV?: string } };

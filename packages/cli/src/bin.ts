#!/usr/bin/env node
import { nodeCtx } from './ctx.ts';
import { main } from './main.ts';

process.exitCode = await main(process.argv.slice(2), nodeCtx());

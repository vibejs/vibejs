// The content-mapper process that TypeScript spawns (package.json `typescript.contentMapper.exec`).
// stdout carries only the protocol.
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { listen } from './mapper.ts';

listen(
  createMessageConnection(
    new StreamMessageReader(process.stdin),
    new StreamMessageWriter(process.stdout),
  ),
);

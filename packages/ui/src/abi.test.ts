// Runs each shared ABI suite on its hand-written compiled twin.
import { Counter } from '../test/abi/Counter.ts';
import { CounterSuite } from '../test/abi/Counter.suite.ts';
import { Form } from '../test/abi/Form.ts';
import { FormSuite } from '../test/abi/Form.suite.ts';
import { List } from '../test/abi/List.ts';
import { ListSuite } from '../test/abi/List.suite.ts';

CounterSuite.run(() => Counter);
ListSuite.run(() => List);
FormSuite.run(() => Form);

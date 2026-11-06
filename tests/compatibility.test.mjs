import assert from 'node:assert/strict';
import { test } from 'node:test';
import fork from '../pi/extensions/question-tool/index.ts';
import { createJiti } from 'jiti';
const { default: upstream } = await createJiti(import.meta.url).import('pi-question-tool/extensions/index.ts');

function definitions(register) {
  const tools = new Map();
  register({ registerTool: (tool) => tools.set(tool.name, tool) });
  return tools;
}
const actual = definitions(fork);
const expected = definitions(upstream);

test('tool definitions match upstream schemas and metadata', () => {
  assert.deepEqual([...actual.keys()], [...expected.keys()]);
  for (const name of actual.keys()) {
    for (const property of ['name', 'label', 'description', 'parameters', 'executionMode']) {
      assert.deepEqual(actual.get(name)[property], expected.get(name)[property], `${name}.${property}`);
    }
  }
});

async function invoke(tool, params, keys) {
  const theme = { fg: (_color, text) => text, bg: (_color, text) => text, bold: (text) => text };
  let component;
  const ctx = { mode: 'tui', ui: {
    setWorkingVisible() {},
    custom(factory) { return new Promise((resolve) => {
      component = factory({ requestRender() {}, terminal: { columns: 80, rows: 24 } }, theme, {}, resolve);
    }); },
  } };
  const promise = tool.execute('test', params, undefined, undefined, ctx);
  const before = component.render(80);
  for (const key of keys) component.handleInput(key);
  return { before, result: await promise };
}

const scenarios = [
  ['question', { question: 'Question?', options: [{ label: 'Alpha', description: 'Synthetic' }] }, ['\r']],
  ['question', { question: 'Question?', options: [{ label: 'Alpha' }] }, ['\x1b']],
  ['question', { question: 'Question?', options: [{ label: 'Alpha' }] }, ['\x1b[B', '\r', 'custom', '\r']],
  ['questionnaire', { questions: [{ id: 'q', prompt: 'Question?', options: [{ value: 'a', label: 'Alpha' }] }] }, ['\r']],
  ['questionnaire', { questions: [{ id: 'q', prompt: 'Question?', options: [{ value: 'a', label: 'Alpha' }] }] }, ['\x1b']],
  ['questionnaire', { questions: [{ id: 'q', prompt: 'Question?', options: [{ value: 'a', label: 'Alpha' }] }] }, ['\x1b[B', '\r', 'custom', '\r']],
  ['questionnaire', { questions: [{ id: 'q1', prompt: 'One?', options: [{ value: 'a', label: 'Alpha' }] }, { id: 'q2', prompt: 'Two?', options: [{ value: 'b', label: 'Beta' }] }] }, ['\r', '\r', '\r']],
];
for (const [name, params, keys] of scenarios) {
  test(`${name} matches upstream for ${JSON.stringify(keys)}`, async () => {
    assert.deepEqual(await invoke(actual.get(name), params, keys), await invoke(expected.get(name), params, keys));
  });
}

import { ESLint } from 'eslint';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function createEslint() {
  return new ESLint({
    overrideConfigFile: path.resolve(process.cwd(), 'eslint.config.js'),
    ignore: false,
  });
}

async function lintSource(code, filename = 'src/lib/static-analysis-fixture.js') {
  const eslint = createEslint();
  const results = await eslint.lintText(code, { filePath: path.resolve(process.cwd(), filename) });
  return results[0].messages;
}

describe('static analysis limits', () => {
  it('rejects files that exceed the enforced max non-comment lines', async () => {
    const body = Array.from({ length: 151 }, (_, i) => `const line${i} = ${i};`).join('\n');
    const messages = await lintSource(`${body}\nexport default line150;`);

    expect(messages.some((message) => message.ruleId === 'max-lines')).toBe(true);
  });

  it('rejects functions that exceed the enforced max non-comment lines', async () => {
    const longFunctionBody = Array.from({ length: 41 }, (_, i) => `  total += ${i};`).join('\n');
    const code = `
function tooLongFunction() {
  let total = 0;
${longFunctionBody}
  return total;
}

export default tooLongFunction;
`;

    const messages = await lintSource(code);
    expect(messages.some((message) => message.ruleId === 'max-lines-per-function')).toBe(true);
  });

  it('accepts a file and function that are within configured limits', async () => {
    const code = `
function withinLimit() {
  const values = [1, 2, 3, 4, 5];
  return values.reduce((sum, value) => sum + value, 0);
}

const result = withinLimit();
export default result;
`;

    const messages = await lintSource(code);
    expect(messages).toEqual([]);
  });
});

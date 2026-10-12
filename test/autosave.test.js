import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('rapid autosaves capture independent values and finish before navigation', async () => {
  const source = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  const script = runInNewContext('`' + source.split('<script>')[1].split('</script>')[0] + '`');
  let submit;
  const requests = [];
  const navigation = [];
  let release;
  let removed = false;
  const row = { dataset: { taskId: '2' }, remove() { removed = true; } };
  runInNewContext(script, {
    URL, URLSearchParams,
    document: { addEventListener(type, handler) { submit = handler; } },
    FormData: class { constructor(form) { return new URLSearchParams(form.values); } },
    HTMLFormElement: { prototype: { submit() { navigation.push(this.action); } } },
    DOMParser: class { parseFromString(text) { return { querySelector() { return text === 'matching' ? {} : null; } }; } },
    async fetch(url, options) {
      requests.push({ path: url.pathname, body: options.body.toString() });
      if (requests.length === 1) await new Promise(resolve => { release = resolve; });
      return { ok: true, async text() { return requests.length === 1 ? 'matching' : 'filtered'; } };
    }
  });
  const form = { action: 'http://localhost/projects/1/tasks/2/priority', values: { priority: 'High' }, querySelector() { return null; }, closest() { return row; } };
  const send = target => submit({ target, preventDefault() {} });
  send(form);
  form.values.priority = 'Low';
  send(form);
  const back = { action: 'http://localhost/', querySelector() { return {}; } };
  send(back);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1);
  assert.deepEqual(navigation, []);
  assert.equal(requests[0].body, 'priority=High');
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests[1].body, 'priority=Low');
  assert.deepEqual(navigation, ['http://localhost/']);
  assert.equal(removed, true);
});

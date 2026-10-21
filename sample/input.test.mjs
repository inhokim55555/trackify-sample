import test from 'node:test';
import assert from 'node:assert/strict';
const {csvCell}=await import('../src/lib/safe-output.ts');
const {readJsonObject}=await import('../src/lib/api.ts');
test('CSV formulas including whitespace prefixes are neutralized',()=>{for(const x of ['=1+1','  =1+1','@SUM(A1)','-1','\t=1'])assert.ok(csvCell(x).startsWith("'"));assert.equal(csvCell('normal'),'normal');});
test('JSON limit measures actual streamed bytes without Content-Length',async()=>{const req=new Request('http://localhost/',{method:'POST',body:'{"x":"'+'a'.repeat(100)+'"}'});await assert.rejects(readJsonObject(req,{maxBytes:32}),/too large/);});
test('small JSON object remains usable',async()=>{assert.deepEqual(await readJsonObject(new Request('http://localhost/',{method:'POST',body:'{"x":1}'})),{x:1});});

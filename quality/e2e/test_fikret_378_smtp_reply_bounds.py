"""#378 r5: task-only fail-first SMTP external-reply resource-bound contract.

Synthetic in-memory stream only: no SMTP server, DNS, network, DB, browser,
credential, mail, protected data or shared runner. This test intentionally
fails against the unbounded readReply() implementation on the pinned main.
It does not by itself authorize a production source change or claim CI PASS.
"""
import os
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
BRANCH = "test/fikret-378-smtp-reply-bounds-20261120"
RUN_THIS_PR = (
    os.environ.get("GITHUB_ACTIONS") == "true"
    and os.environ.get("GITHUB_EVENT_NAME") == "pull_request"
    and os.environ.get("GITHUB_HEAD_REF") == BRANCH
    and os.environ.get("GITHUB_REPOSITORY") == "DenizOner/DogruAdres"
    and bool(os.environ.get("RUNNER_TEMP"))
)

# Node 24 is pinned by existing governance-automation.yml.
# The actual project-owned .ts module is imported through Node type stripping;
# there is no copy of production reply-parsing logic in this test.
NODE_PROBE = r"""
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { SmtpConnection } from './packages/api/src/modules/dogruadres-access/smtp-client.ts';

function connection() {
  return new SmtpConnection({
    enabled: true,
    host: '127.0.0.1',
    port: 1,
    security: 'none',
    fromEmail: 'synthetic@example.invalid',
    socketTimeoutMs: 5000,
  });
}

async function normalReplyMustWork() {
  const client = connection();
  const pipe = new PassThrough();
  // TypeScript private is erased at runtime. No network connect() is called.
  client.socket = pipe;
  try {
    const reply = client.readReply();
    pipe.write(Buffer.from('250-synthetic.example.invalid\r\n250 STARTTLS\r\n'));
    const result = await reply;
    assert.equal(result.code, 250);
    assert.equal(result.message,
      '250-synthetic.example.invalid\r\n250 STARTTLS\r\n');
  } finally {
    client.close();
  }
}

async function fragmentedStarttlsMustWork() {
  const client = connection();
  const pipe = new PassThrough();
  client.socket = pipe;
  try {
    const reply = client.readReply();
    pipe.write(Buffer.from('250-mail.synthetic\r\n250 '));
    pipe.write(Buffer.from('START'));
    pipe.write(Buffer.from('TLS\r'));
    pipe.write(Buffer.from('\n'));
    const result = await reply;
    assert.equal(result.code, 250);
    assert.equal(result.message, '250-mail.synthetic\r\n250 STARTTLS\r\n');
  } finally {
    client.close();
  }
}

async function oversizedUnterminatedReplyMustFailClosed() {
  const client = connection();
  const pipe = new PassThrough();
  client.socket = pipe;
  const pending = client.readReply().then(
    () => ({ kind: 'accepted' }),
    () => ({ kind: 'rejected' }),
  );
  try {
    // A public/authorized SMTP peer can send partial reply bytes indefinitely.
    // Only 2 MiB of synthetic, CRLF-free data is sent and then we stop.
    // No real address or socket is used; the test's own memory is bounded.
    const fragment = Buffer.alloc(256 * 1024, 0x41);
    for (let i = 0; i < 8 && !pipe.destroyed; i++) {
      pipe.write(fragment);
    }
    const result = await Promise.race([
      pending,
      new Promise(resolve =>
        setTimeout(() => resolve({ kind: 'still_pending' }), 900)),
    ]);
    assert.equal(
      result.kind, 'rejected',
      'oversized SMTP reply must reject promptly, not wait for timeout/EOF',
    );
    assert.equal(pipe.destroyed, true,
      'malformed/oversized SMTP reply must close the synthetic stream');
  } finally {
    client.close();
    await pending;
  }
}

await normalReplyMustWork();
await fragmentedStarttlsMustWork();
await oversizedUnterminatedReplyMustFailClosed();
console.log('PASS #378 SMTP bounded external reply: short multiline accepted, oversized unterminated rejected and stream closed');
"""


@unittest.skipUnless(RUN_THIS_PR, "Only Fikret #378 isolated PR Governance runner")
class SmtpReplyBoundsTest(unittest.TestCase):
    def test_01_actual_smtp_reply_parser_positive_and_fail_first_negative(self):
        run = subprocess.run(
            ["node", "--experimental-strip-types", "--input-type=module", "-e", NODE_PROBE],
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=15,
            check=False,
            env={**os.environ, "NODE_ENV": "test"},
        )
        self.assertEqual(
            run.returncode, 0,
            "Synthetic bounded-reply contract RED: actual parser did not fail "
            "closed early on an oversized unterminated peer response; "
            "no real SMTP/network/DB was used. "
            f"Node exit={run.returncode}; details="
            + (run.stderr or run.stdout)[-1400:],
        )
        self.assertIn("PASS #378 SMTP bounded external reply", run.stdout)

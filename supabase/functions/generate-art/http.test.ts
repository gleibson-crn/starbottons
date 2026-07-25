/**
 * Testa a validação de job_id no parseRequest (F-007, AUDIT-2026-07-25):
 * job_id do client vira segmento de path/PK, então precisa ser UUID v4.
 */

import { assert, assertEquals, assertRejects } from "@std/assert";
import { parseRequest } from "./http.ts";
import { ArtError } from "./types.ts";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function post(body: unknown): Request {
  return new Request("http://x/generate-art", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const base = { upload_id: "u1", shape_key: "round", size_mm: 44, options: {} };

Deno.test("F-007: job_id UUID v4 válido é aceito", async () => {
  const jobId = crypto.randomUUID();
  const req = await parseRequest(post({ ...base, job_id: jobId }));
  assertEquals(req.job_id, jobId);
});

Deno.test("F-007: job_id ausente gera um UUID v4", async () => {
  const req = await parseRequest(post(base));
  assert(UUID_V4_RE.test(req.job_id), `gerado deve ser UUID v4: ${req.job_id}`);
});

Deno.test("F-007: job_id com path traversal é rejeitado (400)", async () => {
  const err = await assertRejects(
    () => parseRequest(post({ ...base, job_id: "../../etc/passwd" })),
    ArtError,
  );
  assertEquals((err as ArtError).status, 400);
});

Deno.test("F-007: job_id não-UUID arbitrário é rejeitado (400)", async () => {
  const err = await assertRejects(
    () => parseRequest(post({ ...base, job_id: "not-a-uuid" })),
    ArtError,
  );
  assertEquals((err as ArtError).status, 400);
});

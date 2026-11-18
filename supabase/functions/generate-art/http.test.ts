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

Deno.test("fundo: enquadramento ausente aplica defaults ({x:0,y:0}/1/0)", async () => {
  const req = await parseRequest(post(base));
  assertEquals(req.options.backgroundOffset, { x: 0, y: 0 });
  assertEquals(req.options.backgroundScale, 1);
  assertEquals(req.options.backgroundRotation, 0);
});

Deno.test("fundo: enquadramento informado é repassado", async () => {
  const options = {
    backgroundOffset: { x: 3, y: -2 },
    backgroundScale: 1.5,
    backgroundRotation: 90,
  };
  const req = await parseRequest(post({ ...base, options }));
  assertEquals(req.options.backgroundOffset, { x: 3, y: -2 });
  assertEquals(req.options.backgroundScale, 1.5);
  assertEquals(req.options.backgroundRotation, 90);
});

Deno.test("fundo: valores não-finitos caem no default (sanitização)", async () => {
  const options = {
    backgroundOffset: { x: "NaO", y: null },
    backgroundScale: "muito",
    backgroundRotation: Number.POSITIVE_INFINITY,
  };
  const req = await parseRequest(post({ ...base, options }));
  assertEquals(req.options.backgroundOffset, { x: 0, y: 0 });
  assertEquals(req.options.backgroundScale, 1);
  assertEquals(req.options.backgroundRotation, 0);
});

Deno.test("molduras: frames ausente vira [] (retrocompat, sem moldura)", async () => {
  const req = await parseRequest(post(base));
  assertEquals(req.options.frames, []);
});

Deno.test("molduras: frames não-array vira [] (sanitização)", async () => {
  const req = await parseRequest(
    post({ ...base, options: { frames: "frames/gold.png" } }),
  );
  assertEquals(req.options.frames, []);
});

Deno.test("molduras: item com enquadramento é REPASSADO preservando a ordem", async () => {
  const frames = [
    { path: "frames/a.png", offset: { x: 1, y: 2 }, scale: 1.2, rotation: 15 },
    { path: "frames/b.png", offset: { x: -3, y: 0 }, scale: 0.8, rotation: -5 },
  ];
  const req = await parseRequest(post({ ...base, options: { frames } }));
  assertEquals(req.options.frames, frames);
});

Deno.test("molduras: enquadramento parcial recebe defaults ({x:0,y:0}/1/0)", async () => {
  const req = await parseRequest(
    post({ ...base, options: { frames: [{ path: "frames/a.png" }] } }),
  );
  assertEquals(req.options.frames, [
    { path: "frames/a.png", offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
  ]);
});

Deno.test("molduras: valores não-finitos caem no default (sanitização)", async () => {
  const req = await parseRequest(
    post({
      ...base,
      options: {
        frames: [{
          path: "frames/a.png",
          offset: { x: "x", y: null },
          scale: "muito",
          rotation: Number.POSITIVE_INFINITY,
        }],
      },
    }),
  );
  assertEquals(req.options.frames, [
    { path: "frames/a.png", offset: { x: 0, y: 0 }, scale: 1, rotation: 0 },
  ]);
});

Deno.test("enquadramento: scale/offset GIGANTE são CLAMPADOS (anti-DoS do worker, F-A)", async () => {
  const req = await parseRequest(
    post({
      ...base,
      options: {
        frames: [{ path: "frames/a.png", scale: 1e4, offset: { x: 99999, y: -99999 } }],
        scale: 1e4,
        backgroundScale: 0,
      },
    }),
  );
  // Moldura: scale no teto 10; offset no teto ±500mm.
  const frame = req.options.frames![0];
  assertEquals(frame.scale, 10);
  assertEquals(frame.offset, { x: 500, y: -500 });
  // Arte e fundo: MESMO clamp (scale 1e4→10; 0→piso 0.1).
  assertEquals(req.options.scale, 10);
  assertEquals(req.options.backgroundScale, 0.1);
});

Deno.test("molduras: itens inválidos (sem path) são descartados", async () => {
  const req = await parseRequest(
    post({
      ...base,
      options: {
        frames: [
          { path: "" }, // path vazio → descartado
          123, // não-objeto → descartado
          null, // null → descartado
          { path: "frames/ok.png" }, // válido
        ],
      },
    }),
  );
  assertEquals(req.options.frames?.length, 1);
  assertEquals(req.options.frames?.[0].path, "frames/ok.png");
});

Deno.test("molduras: array com >3 é clampado a 3 (excedente ignorado)", async () => {
  const frames = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.png` }));
  const req = await parseRequest(post({ ...base, options: { frames } }));
  assertEquals(req.options.frames?.length, 3);
  // Preserva os PRIMEIROS 3 na ordem (z-order).
  assertEquals(req.options.frames?.map((f) => f.path), [
    "f0.png",
    "f1.png",
    "f2.png",
  ]);
});

Deno.test("flip: flipH/flipV true sobrevivem ao parse", async () => {
  const req = await parseRequest(
    post({ ...base, options: { flipH: true, flipV: true } }),
  );
  assertEquals(req.options.flipH, true);
  assertEquals(req.options.flipV, true);
});

Deno.test("flip: ausente → false; não-boolean → false", async () => {
  const a = await parseRequest(post(base));
  assertEquals([a.options.flipH, a.options.flipV], [false, false]);
  const b = await parseRequest(
    post({ ...base, options: { flipH: "true", flipV: 1 } }),
  );
  assertEquals([b.options.flipH, b.options.flipV], [false, false]);
});

Deno.test("sequenceLabel: sanitiza para só dígitos ('A1b2' -> '12')", async () => {
  const req = await parseRequest(
    post({ ...base, options: { sequenceLabel: "A1b2" } }),
  );
  assertEquals(req.options.sequenceLabel, "12");
});

Deno.test("sequenceLabel: >8 dígitos é cortado em 8", async () => {
  const req = await parseRequest(
    post({ ...base, options: { sequenceLabel: "1234567890123" } }),
  );
  assertEquals(req.options.sequenceLabel, "12345678");
});

Deno.test("sequenceLabel: ausente, vazio, sem dígitos ou não-string -> omitido", async () => {
  for (const v of [undefined, "", "abc", 42]) {
    const req = await parseRequest(
      post({ ...base, options: { sequenceLabel: v } }),
    );
    assertEquals(req.options.sequenceLabel, undefined);
    assert(!("sequenceLabel" in req.options));
  }
});

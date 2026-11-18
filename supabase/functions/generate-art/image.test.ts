/**
 * Testes de composição de camadas (image.ts) usando o ImageScript REAL — sem
 * mocks (implementação real é a estratégia preferida; composeArtwork recebe
 * bytes crus, então não há I/O externo a simular).
 *
 * Foco: garantir a ORDEM das camadas — fundo → arte → MOLDURAS no topo (até 3,
 * na ORDEM do array = z-order) — e que cada moldura PNG preserva o canal alfa
 * (miolo transparente deixa a arte/molduras inferiores aparecerem) e aplica seu
 * próprio enquadramento (offset/scale/rotation).
 *
 * Execução: deno test image.test.ts (baixa/usa o WASM do ImageScript em cache).
 */

import { assert, assertEquals } from "@std/assert";
import { decodeBase64 } from "@std/encoding/base64";
import { Image } from "./deps.ts";
import { composeArtwork, type FrameLayer, FRAME_MAX_DIM } from "./image.ts";

const SIZE = 100;
const DPI = 300;
const OPTS = { offset: { x: 0, y: 0 }, scale: 1, rotation: 0 };

const RED = Image.rgbaToColor(255, 0, 0, 255);
const GREEN = Image.rgbaToColor(0, 255, 0, 255);
const BLUE = Image.rgbaToColor(0, 0, 255, 255);
const MAGENTA = Image.rgbaToColor(255, 0, 255, 255);
const CLEAR = Image.rgbaToColor(0, 0, 0, 0);

/** PNG quadrado sólido `size×size` na cor informada. */
async function solidPng(size: number, color: number): Promise<Uint8Array> {
  const img = new Image(size, size);
  img.fill(color);
  return await img.encode();
}

/**
 * Moldura PNG `size×size`: borda OPACA na cor dada + quadrado central
 * `inner×inner` TRANSPARENTE (alfa 0) — modela a moldura real (miolo vazado p/
 * a arte / molduras inferiores aparecerem).
 */
async function framePng(
  size: number,
  inner: number,
  color: number = BLUE,
): Promise<Uint8Array> {
  const img = new Image(size, size);
  img.fill(color);
  const lo = Math.floor((size - inner) / 2);
  for (let x = lo + 1; x <= lo + inner; x++) {
    for (let y = lo + 1; y <= lo + inner; y++) {
      img.setPixelAt(x, y, CLEAR);
    }
  }
  return await img.encode();
}

/** Embrulha bytes de moldura num FrameLayer com enquadramento (default = OPTS). */
function layer(bytes: Uint8Array, opts = OPTS): FrameLayer {
  return { bytes, opts };
}

/** Compõe e devolve a imagem resultante já decodificada. */
async function compose(
  art: Uint8Array,
  frames?: FrameLayer[] | null,
): Promise<Image> {
  const b64 = await composeArtwork(
    art,
    SIZE,
    DPI,
    OPTS,
    null,
    undefined,
    frames,
  );
  return (await Image.decode(decodeBase64(b64))) as Image;
}

/** [r,g,b,a] de um pixel (coords 1-based do ImageScript). */
function px(img: Image, x: number, y: number): number[] {
  return Image.colorToRGBA(img.getPixelAt(x, y));
}

Deno.test("sem moldura: comportamento atual (arte inteira preservada)", async () => {
  const out = await compose(await solidPng(SIZE, RED));
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
  assertEquals(px(out, 5, 5), [255, 0, 0, 255]);
});

Deno.test("frames=[] (array vazio): retrocompat, idêntico a sem moldura", async () => {
  const out = await compose(await solidPng(SIZE, RED), []);
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
  assertEquals(px(out, 5, 5), [255, 0, 0, 255]);
});

Deno.test("moldura OPACA fica NA FRENTE da arte (camada de topo)", async () => {
  // Moldura totalmente azul opaca (inner=0) tapa a arte → prova que é desenhada
  // DEPOIS da arte.
  const out = await compose(await solidPng(SIZE, RED), [
    layer(await framePng(SIZE, 0)),
  ]);
  assertEquals(px(out, 50, 50), [0, 0, 255, 255]);
});

Deno.test("moldura preserva alfa: borda por cima, miolo deixa a arte aparecer", async () => {
  const out = await compose(await solidPng(SIZE, RED), [
    layer(await framePng(SIZE, 40)),
  ]);
  // Miolo transparente → arte (vermelha) visível.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
  // Borda opaca → moldura (azul) por cima.
  assertEquals(px(out, 5, 5), [0, 0, 255, 255]);
});

Deno.test("moldura cobre o círculo VISÍVEL (não a sangria): borda NÃO invade a área morta", async () => {
  // frameCoverPx=60 < artPx=100 → a moldura preenche só o centro (visível 20..80);
  // o anel 0..20 / 80..100 é SANGRIA (área morta) e deve mostrar a ARTE, não a moldura.
  const art = await solidPng(SIZE, RED);
  const frames = [layer(await framePng(SIZE, 40))];
  const b64 = await composeArtwork(
    art,
    SIZE,
    DPI,
    OPTS,
    null,
    undefined,
    frames,
    60,
  );
  const out = (await Image.decode(decodeBase64(b64))) as Image;
  // Canto (sangria) → ARTE vermelha (a moldura NÃO chega aqui) — prova o fix.
  assertEquals(px(out, 5, 5), [255, 0, 0, 255]);
  // Dentro do anel da moldura (região visível) → borda azul.
  assertEquals(px(out, 25, 50), [0, 0, 255, 255]);
  // Centro (miolo transparente) → arte vermelha.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
});

Deno.test("ordem completa: fundo → arte → moldura (moldura vence no topo)", async () => {
  const art = await solidPng(SIZE, RED);
  const bg = await solidPng(SIZE, GREEN);
  const frames = [layer(await framePng(SIZE, 40))];
  const b64 = await composeArtwork(art, SIZE, DPI, OPTS, bg, undefined, frames);
  const out = (await Image.decode(decodeBase64(b64))) as Image;
  // Miolo: arte opaca cobre o fundo; moldura transparente ali → vermelho.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
  // Borda: moldura opaca no topo → azul (não verde do fundo nem vermelho da arte).
  assertEquals(px(out, 5, 5), [0, 0, 255, 255]);
});

Deno.test("duas molduras empilhadas: z-order (topo vence; inferior aparece no vazado do topo)", async () => {
  // back = anel GROSSO azul (miolo transparente só 41..60).
  // front = anel FINO verde (miolo transparente 21..80), POR CIMA.
  const art = await solidPng(SIZE, RED);
  const back = layer(await framePng(SIZE, 20, BLUE));
  const front = layer(await framePng(SIZE, 60, GREEN));
  const out = await compose(art, [back, front]);
  // Canto (~5px): ambas opacas; front (topo) vence → verde.
  assertEquals(px(out, 5, 5), [0, 255, 0, 255]);
  // Anel médio (~25px): front TRANSPARENTE ali, back opaca → azul do inferior
  // aparece pelo vazado do topo (prova que back está SOB front).
  assertEquals(px(out, 25, 50), [0, 0, 255, 255]);
  // Centro (~50px): ambas transparentes → arte vermelha.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
});

Deno.test("três molduras empilhadas: z-order preservado (0 fundo → 2 topo)", async () => {
  const art = await solidPng(SIZE, RED);
  // Aneis concêntricos: o topo (f2) tem o maior vazado; cada inferior tem anel
  // opaco mais interno, aparecendo pelo vazado dos de cima. Cores distintas.
  const f0 = layer(await framePng(SIZE, 20, BLUE)); // vazado só 41..60
  const f1 = layer(await framePng(SIZE, 50, GREEN)); // vazado 26..75
  const f2 = layer(await framePng(SIZE, 80, MAGENTA)); // vazado 11..90 (topo)
  const out = await compose(art, [f0, f1, f2]);
  // Canto (~5px): as três opacas; f2 (topo) vence → magenta.
  assertEquals(px(out, 5, 5), [255, 0, 255, 255]);
  // ~15px: f2 vazada; f1 opaca (acima de f0) → verde.
  assertEquals(px(out, 15, 50), [0, 255, 0, 255]);
  // ~30px: f2 e f1 vazadas; f0 opaca → azul (o mais ao fundo aparece).
  assertEquals(px(out, 30, 50), [0, 0, 255, 255]);
  // Centro (~50px): todas vazadas → arte vermelha.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
});

Deno.test("molduras com offset próprio: cada uma usa seu enquadramento", async () => {
  // Moldura totalmente opaca deslocada por offset em MM; prova que o transform
  // por-moldura é aplicado (a composição desloca o conteúdo).
  const art = await solidPng(SIZE, RED);
  // Offset grande o bastante (em MM @300dpi) p/ empurrar a moldura opaca para
  // fora de um dos cantos, revelando a arte.
  const shifted = layer(await framePng(SIZE, 0, BLUE), {
    offset: { x: -30, y: -30 },
    scale: 1,
    rotation: 0,
  });
  const centered = layer(await framePng(SIZE, 0, GREEN), OPTS);
  // Só a deslocada: canto inferior-direito fica descoberto → arte vermelha.
  const outShift = await compose(art, [shifted]);
  assertEquals(px(outShift, 95, 95), [255, 0, 0, 255]);
  // Já a centrada (sem offset) cobre tudo → verde no mesmo canto. Prova que o
  // transform é POR-moldura (offset diferente ⇒ resultado diferente).
  const outCenter = await compose(art, [centered]);
  assertEquals(px(outCenter, 95, 95), [0, 255, 0, 255]);
});

Deno.test("moldura > FRAME_MAX_DIM: downscale mantém alfa e a ordem", async () => {
  const big = FRAME_MAX_DIM + 200; // 1200 → downscale defensivo a ≤1000
  const art = await solidPng(SIZE, RED);
  const frame = await framePng(big, Math.floor(big * 0.4));
  const out = await compose(art, [layer(frame)]);
  // Miolo transparente sobrevive ao resize → arte visível.
  assertEquals(px(out, 50, 50), [255, 0, 0, 255]);
  // Borda opaca sobrevive → moldura no topo.
  const [, , b, a] = px(out, 3, 3);
  assert(a > 200, "borda da moldura deveria continuar opaca após downscale");
  assert(b > 200, "borda da moldura deveria continuar azul após downscale");
});

/** Arte 100×100 assimétrica: TL vermelho, TR verde, BL azul, BR magenta. */
async function quadrantPng(): Promise<Uint8Array> {
  const img = new Image(SIZE, SIZE);
  const h = SIZE / 2;
  img.drawBox(1, 1, h, h, RED);
  img.drawBox(h + 1, 1, h, h, GREEN);
  img.drawBox(1, h + 1, h, h, BLUE);
  img.drawBox(h + 1, h + 1, h, h, MAGENTA);
  return await img.encode();
}

async function composeOpts(
  art: Uint8Array,
  opts: Record<string, unknown>,
): Promise<Image> {
  const b64 = await composeArtwork(art, SIZE, DPI, { ...OPTS, ...opts });
  return (await Image.decode(decodeBase64(b64))) as Image;
}

const TL = [10, 10], TR = [90, 10], BL = [10, 90], BR = [90, 90];
const at = (i: Image, [x, y]: number[]) => px(i, x, y);

Deno.test("flip: sem flip a arte fica intacta (sanidade dos quadrantes)", async () => {
  const o = await composeOpts(await quadrantPng(), {});
  assertEquals(at(o, TL), [255, 0, 0, 255]);
  assertEquals(at(o, TR), [0, 255, 0, 255]);
  assertEquals(at(o, BL), [0, 0, 255, 255]);
  assertEquals(at(o, BR), [255, 0, 255, 255]);
});

Deno.test("flipH espelha X", async () => {
  const o = await composeOpts(await quadrantPng(), { flipH: true });
  assertEquals(at(o, TL), [0, 255, 0, 255]);
  assertEquals(at(o, TR), [255, 0, 0, 255]);
  assertEquals(at(o, BL), [255, 0, 255, 255]);
  assertEquals(at(o, BR), [0, 0, 255, 255]);
});

Deno.test("flipV espelha Y", async () => {
  const o = await composeOpts(await quadrantPng(), { flipV: true });
  assertEquals(at(o, TL), [0, 0, 255, 255]);
  assertEquals(at(o, TR), [255, 0, 255, 255]);
  assertEquals(at(o, BL), [255, 0, 0, 255]);
  assertEquals(at(o, BR), [0, 255, 0, 255]);
});

Deno.test("flipH + rotação 90°: ordem flip → rotate (eixo local)", async () => {
  const art = await quadrantPng();
  // Referência: espelha a fonte manualmente e só então roda (flip→rotate).
  const pre = (await Image.decode(art)) as Image;
  pre.flip("horizontal");
  const expected = await composeOpts(await pre.encode(), { rotation: 90 });
  const got = await composeOpts(art, { flipH: true, rotation: 90 });
  // Referência da ordem inversa (rotate→flip) para provar que difere.
  const rotOnly = await composeOpts(art, { rotation: 90 });
  rotOnly.flip("horizontal");
  for (const p of [TL, TR, BL, BR]) {
    assertEquals(at(got, p), at(expected, p));
  }
  assert(
    [TL, TR, BL, BR].some((p) =>
      at(got, p).join() !== at(rotOnly, p).join()
    ),
    "flip→rotate deve diferir de rotate→flip",
  );
});

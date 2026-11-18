/**
 * Catálogo server-side de estilos (id → prompt). Os prompts são GENÉRICOS: não
 * citam franquia, estúdio, filme ou personagem protegido — e todo prompt termina
 * com a cláusula fixa que reforça isso e preserva sujeitos/composição.
 */

import { StyleError } from "./types.ts";

/**
 * Anti-IP compartilhado por TODO estilo (fiel e transformador). Proíbe também
 * ESCREVER nomes/lugares no resultado — os modelos tendem a rotular a cena com
 * o nome da franquia (ex.: escrever "Springfield" numa placa).
 */
const ANTI_IP =
  "Do not reference, name, write or imitate any specific brand, studio, movie, " +
  "copyrighted franchise, character, mascot, logo, catchphrase or place name.";

/**
 * Cláusula FIEL (estilos "pintura da foto"): preserva rosto/expressão/pose e a
 * composição — muda SÓ o estilo artístico. Usada com `input_fidelity: high`.
 */
const CLAUSE_FAITHFUL =
  "CRITICAL: keep every person clearly recognizable as the exact same " +
  "individual — faithfully preserve each face, its features, proportions and " +
  "facial EXPRESSION (smile, gaze), plus the same pose, hair and number of " +
  "people. Do NOT alter, swap, beautify, age or invent faces. " + ANTI_IP +
  " Keep the original people, animals and objects and the overall composition; " +
  "change ONLY the artistic style.";

/**
 * Cláusula CARTOON (Você Amarelo, Anime): vira DESENHO. Fixa a identidade
 * (mesmas pessoas, nº, cabelo, expressão) e proíbe look fotográfico. NÃO leva
 * anti-IP (por decisão do dono, esses estilos CITAM a franquia). Usada com
 * `input_fidelity: low` para o modelo redesenhar de fato.
 */
const CLAUSE_CARTOON =
  "Keep every person recognizable as the same individuals — the same number of " +
  "people, their hairstyles, facial hair, accessories and the same happy facial " +
  "EXPRESSION. Do not add or remove people and do not add extra characters in " +
  "the foreground. Fully commit to the illustrated cartoon style and do NOT " +
  "produce a photographic, 3D or hyper-realistic look.";

/**
 * Cláusula REALISTA (Guerreiro Espacial): resultado FOTORREALISTA/cinematográfico
 * (NÃO cartoon). CRÍTICO preservar rosto/PELE/identidade (o modelo tende a
 * clarear a pele/reinventar rostos quando tem liberdade) — por isso usada com
 * `input_fidelity: high`. A troca de ROUPA/CENÁRIO fica no prompt do estilo. NÃO
 * leva anti-IP (cita a franquia). Risco de IP é do OUTPUT vendido, não do prompt;
 * citar franquia pode elevar recusa por moderação (422 content_policy).
 */
const CLAUSE_REALISTIC =
  "CRITICAL: keep every person's face, facial features, SKIN TONE and likeness " +
  "EXACTLY as in the reference photo — the same individuals, the same number of " +
  "people, the same expressions and hairstyles. Do NOT lighten or change anyone's " +
  "skin color, and do not beautify, age, swap or invent faces. Render everything " +
  "in a PHOTOREALISTIC, cinematic, film-quality style — NOT a cartoon, drawing or " +
  "illustration. Do not add extra people in the foreground.";

/** Palavra de intensidade derivada de `strength` (0..1). */
export type StrengthWord = "subtle" | "moderate" | "strong";

/** Fidelidade à imagem de entrada repassada ao provider (OpenAI). */
export type Fidelity = "high" | "low";

/**
 * Modo do estilo (define fidelidade + cláusula + intensidade):
 *  - `faithful`  = pinta a foto, preserva tudo (aquarela, esboço…). fidelity high.
 *  - `cartoon`   = vira DESENHO (Você Amarelo, Anime). fidelity low + strong.
 *  - `realistic` = FOTORREALISTA, muda só roupa/cenário (Guerreiro Espacial).
 *                  fidelity high (preserva rosto/pele) + strong.
 */
export type StyleMode = "faithful" | "cartoon" | "realistic";

interface StyleEntry {
  readonly label: string;
  readonly prompt: string;
  /** Modo do estilo. Ausente ⇒ `faithful` (pintura fiel à foto). */
  readonly mode?: StyleMode;
}

/** Config por modo: fidelidade à entrada, cláusula anexada e força fixa. */
const MODE_CONFIG: Readonly<
  Record<StyleMode, { fidelity: Fidelity; clause: string; forceStrong: boolean }>
> = {
  faithful: { fidelity: "high", clause: CLAUSE_FAITHFUL, forceStrong: false },
  cartoon: { fidelity: "low", clause: CLAUSE_CARTOON, forceStrong: true },
  realistic: { fidelity: "high", clause: CLAUSE_REALISTIC, forceStrong: true },
};

/** id → (label, prompt resumido, modo). */
const STYLES: Readonly<Record<string, StyleEntry>> = {
  "cartoon": {
    label: "Cartoon",
    prompt:
      "Redraw the entire image — the people and the background scene — as a " +
      "polished flat 2D animated cartoon: clean bold black outlines, solid flat " +
      "fill colors, smooth simplified shapes, gentle cel shading and soft " +
      "highlights, with expressive but simple facial features. High-quality, " +
      "hand-drawn cartoon illustration look; do not add any text, letters, logos " +
      "or watermarks.",
  },
  "aquarela": {
    label: "Aquarela",
    prompt:
      "Repaint the entire image — the people and the background scene — as a " +
      "delicate watercolor painting: soft translucent color washes, blended wet " +
      "brush strokes, gentle color bleeds and smooth gradients, visible paper " +
      "grain and subtle texture, with light, airy hand-painted edges. Fine-art " +
      "watercolor look; do not add any text, letters, logos or watermarks.",
  },
  "hq": {
    label: "HQ / Quadrinho",
    prompt:
      "Restyle the entire image — the people and the background scene — as bold " +
      "comic-book / graphic-novel art: strong black ink outlines, dynamic " +
      "cross-hatching, halftone (Ben-Day) dot shading, high-contrast dramatic " +
      "coloring and crisp inking. Printed comic illustration look; do not add " +
      "any text, speech bubbles, letters, logos or watermarks.",
  },
  "pop-art": {
    label: "Pop Art",
    prompt:
      "Restyle the entire image — the people and the background scene — as a " +
      "classic pop-art silkscreen print: bold saturated flat color blocks, high " +
      "contrast, thick clean outlines, halftone dot patterns and a vivid, " +
      "graphic screen-print palette. Retro pop-art poster look; do not add any " +
      "text, letters, logos or watermarks.",
  },
  "esboco": {
    label: "Esboço a Lápis",
    prompt:
      "Redraw the entire image — the people and the background scene — as a " +
      "detailed graphite pencil sketch: fine hatching and cross-hatching, soft " +
      "tonal shading and gradients, visible hand-drawn pencil strokes and paper " +
      "texture, in monochrome grayscale. Realistic hand-drawn sketch look; do " +
      "not add any text, letters, logos or watermarks.",
  },
  "voce-amarelo": {
    label: "Você Amarelo",
    mode: "cartoon",
    prompt:
      "Redraw the people as characters in the classic 2D animated style of The " +
      "Simpsons (Matt Groening's TV sitcom cartoon): " +
      "bright YELLOW skin, large heads and large eyes, white eyes with small " +
      "black pupils, simple and expressive facial features, a stylized nose and " +
      "mouth, clean thick black outlines, hands with few details, and flat solid " +
      "colors with subtle shading. Faithfully keep the same composition, framing, " +
      "poses, arm positions, facial expressions, hairstyles, facial hair, " +
      "clothing and accessories as in the reference photo. Keep the SAME " +
      "background and setting from the photo, redrawn in the same flat 2D cartoon " +
      "style with matching colors and lighting — do not invent a different scene. " +
      "High-quality 2D digital illustration with well-defined lines and a warm, " +
      "family-friendly look.",
  },
  "guerreiro-espacial": {
    label: "Guerreiro Espacial",
    mode: "realistic",
    prompt:
      "Turn the reference photo into a PHOTOREALISTIC, cinematic Star Wars movie " +
      "poster. Keep the people's faces, skin tone, expressions, hairstyles and " +
      "poses exactly as in the photo — same likeness, photorealistic (not a " +
      "cartoon or illustration). Change ONLY their clothing and the background: " +
      "dress them in Jedi-like robes and have them hold glowing lightsabers, and " +
      "replace the background with an epic outer-space scene with spaceships, " +
      "planets and dramatic cinematic lighting. Highly detailed, film-quality, " +
      "realistic photography look.",
  },
  "anime": {
    label: "Anime",
    mode: "cartoon",
    prompt:
      "Redraw the people as characters in a high-quality modern Japanese " +
      "anime/manga illustration. Faithfully keep the same composition, framing, " +
      "poses, arm and hand positions, the closeness between the people, facial " +
      "expressions, hairstyles, hair, facial hair, clothing (with the same colors " +
      "and patterns) and accessories as in the reference photo. Keep the SAME " +
      "background and setting from the photo, redrawn in the same anime style — " +
      "do not invent a different scene. Convert the people to a polished anime " +
      "aesthetic: delicate facial features, large expressive eyes with shine and " +
      "reflections, clean well-defined line art, elegant outlines, a stylized " +
      "nose and mouth, and detailed hair drawn with individual strands, with a " +
      "hand-drawn illustration look. Use sophisticated cel shading, soft shadows, " +
      "warm cinematic lighting and vibrant colors. Keep proportions natural and " +
      "pleasant — do not turn it into an exaggerated caricature. Do not add any " +
      "text, letters, logos or watermarks. Professional, richly detailed, " +
      "high-definition anime finish.",
  },
  "ghibli": {
    label: "Studio Ghibli",
    mode: "cartoon",
    // NOTA: citar "Studio Ghibli"/"Miyazaki" no prompt dispara recusa dura da
    // OpenAI (422 content_policy — "no estilo de artista/estúdio vivo"),
    // confirmado em teste ao vivo (7,4s). Por isso descrevemos a ESTÉTICA
    // genericamente (o rótulo do chip continua "Studio Ghibli", client-side).
    prompt:
      "Redraw the people as characters in a soft, hand-drawn 2D Japanese " +
      "animation style with a warm, nostalgic, painterly feel. Faithfully keep " +
      "the same composition, framing, poses, arm and hand positions, the " +
      "closeness between the people, facial expressions, hairstyles, hair, " +
      "clothing (with the same colors and patterns) and accessories as in the " +
      "reference photo. Keep the SAME background and setting from the photo, " +
      "repainted in this style — do not invent a different scene. Convert the " +
      "people to the aesthetic: soft rounded facial features, large gentle " +
      "expressive eyes, simple soft noses and mouths, clean delicate line work " +
      "and softly shaded hair. Paint the background as a lush, hand-painted " +
      "watercolor-like scene with soft warm natural lighting, gentle color " +
      "gradients and a cozy, whimsical, nostalgic atmosphere. Keep proportions " +
      "natural and pleasant — do not turn it into an exaggerated caricature. Do " +
      "not add any text, letters, logos or watermarks. High-quality, hand-drawn " +
      "animated-film illustration finish.",
  },
};

/** Estilo resolvido: prompt final pronto para o provider. */
export interface ResolvedStyle {
  readonly styleId: string;
  readonly label: string;
  readonly strength: number;
  readonly word: StrengthWord;
  readonly prompt: string;
  /** Fidelidade à entrada (baixa só no modo cartoon). */
  readonly fidelity: Fidelity;
  /** Modo resolvido (faithful/cartoon/realistic) — útil para logs/testes. */
  readonly mode: StyleMode;
}

/** Restringe `strength` ao intervalo [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Mapeia a intensidade numérica para linguagem no prompt. */
function strengthWord(strength: number): StrengthWord {
  if (strength < 0.34) return "subtle";
  if (strength < 0.67) return "moderate";
  return "strong";
}

/** Monta o prompt final: intensidade + estilo + cláusula (fiel/transformadora). */
function buildPrompt(base: string, word: StrengthWord, clause: string): string {
  return `Apply a ${word} artistic style transformation. ${base} ${clause}`;
}

/**
 * Resolve `styleId` → prompt final. Lança StyleError(400) para id desconhecido.
 * `strength` sofre clamp 0..1 e vira linguagem (subtle/moderate/strong).
 *
 * MODO POR ESTILO (MODE_CONFIG): cada modo define fidelidade + cláusula + se
 * força "strong". `cartoon`/`realistic` forçam "strong"; `faithful` mantém a
 * intensidade do cliente. `cartoon` usa `fidelity: low` (redesenha); `faithful`
 * e `realistic` usam `high` (preservam a foto/identidade e a pele).
 */
export function resolveStyle(
  styleId: string,
  strength: number,
): ResolvedStyle {
  const entry = STYLES[styleId];
  if (!entry) throw new StyleError(400, `style_id desconhecido: ${styleId}`);
  const s = clamp01(strength);
  const mode = entry.mode ?? "faithful";
  const cfg = MODE_CONFIG[mode];
  const word: StrengthWord = cfg.forceStrong ? "strong" : strengthWord(s);
  return {
    styleId,
    label: entry.label,
    strength: s,
    word,
    prompt: buildPrompt(entry.prompt, word, cfg.clause),
    fidelity: cfg.fidelity,
    mode,
  };
}

/** Ids conhecidos (para validação/documentação). */
export function knownStyleIds(): string[] {
  return Object.keys(STYLES);
}
